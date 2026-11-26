// Entrar con huella o cara en el navegador: passkeys WebAuthn + extensión PRF (WebCrypto puro, sin librerías).
// Lo usan el portal (activar y quitar celulares, js/sesion.js) y la entrada única de la nube (/portal/js/huella.js, desde paginas.js).
//
// Decisión de diseño: la sal PRF es FIJA de la app, SHA-256('club-nautico-huella-v1'), la misma en todas las credenciales.
// Motivo: en la entrada (`/`) todavía no se sabe quién es la persona, así que no se puede pedir la sal que guardó su ranura (evalByCredential
// exige conocer los credId de antemano). No pierde seguridad: la salida PRF la calcula cada autenticador con un secreto propio de CADA
// credencial (hmac-secret), así que la misma sal da salidas distintas e impredecibles por credencial y por celular. Después, llaveDeHuella()
// (llavero.js) deriva por HKDF con info = credId la llave que envuelve K. Si algún día se cambia la sal, hay que usar otra versión en el texto.
// La huella o la cara nunca salen del celular; el sitio solo recibe una firma (profesores) o nada (nadadores).
import { bytesAb64u } from './llavero.js';

const enc = new TextEncoder();
const aHex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexAbytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

export class ErrorHuella extends Error {
  /** codigo: 'sinprf' (el celular no permite abrir los datos con la huella), 'cancelado', 'yaexiste', 'otro' */
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
export const MSG_SIN_PRF = 'Este celular no permite abrir tus datos con la huella; sigue con tu clave.';

let _sal = null;
async function sal() { return _sal || (_sal = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('club-nautico-huella-v1')))); }

/** ¿Este navegador puede? WebAuthn existe y hay un autenticador de la plataforma (huella, cara o PIN del celular). Que PRF funcione solo se sabe al crear. */
let _disp = null;
export function disponible() {
  if (_disp) return _disp;
  _disp = (async () => {
    try {
      if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return false;
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
      return !!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch { return false; }
  })();
  return _disp;
}

function traduce(e) {
  if (e && e.name === 'InvalidStateError') return new ErrorHuella('yaexiste', 'Este celular ya tiene la huella activada.');
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return new ErrorHuella('cancelado', 'No se pudo leer la huella. Intenta otra vez.');
  if (e && e.name === 'NotSupportedError') return new ErrorHuella('sinprf', MSG_SIN_PRF);
  return new ErrorHuella('otro', 'No se pudo usar la huella en este celular. Sigue con tu clave.');
}

function salidaPrf(cred) {
  const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
  const p = ext && ext.prf;
  const r = p && p.results && p.results.first;
  return { hay: !!p, habilitada: !!(p && p.enabled !== false), prf: r ? new Uint8Array(r) : null };
}

/** Pide una aserción (huella o cara). Sin credId = credencial descubrible (el celular deja elegir la cuenta). `challenge` = bytes.
 *  Devuelve { credId, h (hex del userHandle o null), prf (32 bytes o null), authData, clientData, sig, userHandle } (todo Uint8Array). */
export async function pedir({ challenge, credId = null }) {
  const publicKey = { challenge, userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: await sal() } } } };
  if (credId) publicKey.allowCredentials = [{ type: 'public-key', id: credId }];
  let a;
  try { a = await navigator.credentials.get({ publicKey }); } catch (e) { throw traduce(e); }
  const r = a.response, uh = r.userHandle ? new Uint8Array(r.userHandle) : null;
  return {
    credId: new Uint8Array(a.rawId), h: uh && uh.length === 32 ? aHex(uh) : null, prf: salidaPrf(a).prf,
    authData: new Uint8Array(r.authenticatorData), clientData: new Uint8Array(r.clientDataJSON), sig: new Uint8Array(r.signature), userHandle: uh,
  };
}

/** Crea la passkey de este celular (userHandle = bytes de h) y devuelve { credId, prf, spki, alg }. Si la creación no trae el resultado PRF
 *  se hace de inmediato un get con esa credencial; si aun así no hay PRF lanza ErrorHuella('sinprf'). */
export async function crear({ h, name, displayName, excluir = [] }) {
  const publicKey = {
    rp: { id: location.hostname, name: 'Club Náutico' },
    user: { id: hexAbytes(h), name, displayName },          // name 'Club Náutico' y displayName 'Sofía · Club Náutico': distingue hermanos sin el apellido
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],          // ES256 (lo que verifica el Worker para profesores)
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required', authenticatorAttachment: 'platform' },
    attestation: 'none', timeout: 120000,
    excludeCredentials: excluir.map((id) => ({ type: 'public-key', id })),
    extensions: { prf: { eval: { first: await sal() } } },
  };
  let c;
  try { c = await navigator.credentials.create({ publicKey }); } catch (e) { throw traduce(e); }
  const s = salidaPrf(c);
  if (!s.hay || !s.habilitada) throw new ErrorHuella('sinprf', MSG_SIN_PRF);
  const credId = new Uint8Array(c.rawId);
  let prf = s.prf;
  if (!prf) prf = (await pedir({ challenge: crypto.getRandomValues(new Uint8Array(32)), credId })).prf;
  if (!prf || prf.length !== 32) throw new ErrorHuella('sinprf', MSG_SIN_PRF);
  const alg = c.response.getPublicKeyAlgorithm ? c.response.getPublicKeyAlgorithm() : -7;
  const spki = c.response.getPublicKey ? new Uint8Array(c.response.getPublicKey()) : null;
  if (alg !== -7 || !spki) throw new ErrorHuella('otro', 'Este celular no sirve para la huella. Sigue con tu clave.');
  return { credId, prf, spki, alg };
}

/** Intenta que el celular olvide una passkey que ya no sirve (solo un aviso al navegador; no todos lo entienden). */
export async function avisarQuitada(credId) {
  try { if (window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) await PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: bytesAb64u(credId) }); } catch {}
}
