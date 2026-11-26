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
  /** codigo: 'sinprf' (el celular no permite abrir los datos con la huella), 'cancelado', 'yaexiste', 'otro'. `causa` = la excepción original del navegador. */
  constructor(codigo, mensaje, causa = null) { super(mensaje); this.codigo = codigo; this.causa = causa; }
}
export const MSG_SIN_PRF = 'Este celular no permite abrir tus datos con la huella; sigue con tu clave.';
export const MSG_IOS = ' En iPhone, prueba activarla desde Safari.';

/** ¿iPhone o iPad con un navegador que no es Safari (Chrome, Firefox, Edge)? Ahí la huella con PRF a veces no funciona. */
export function iosNoSafari(ua = navigator.userAgent || '') { return /iPhone|iPad|iPod/.test(ua) && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua); }
export const msgSinPrf = () => MSG_SIN_PRF + (iosNoSafari() ? MSG_IOS : '');

let _sal = null;
async function sal() { return _sal || (_sal = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('club-nautico-huella-v1')))); }

/** Qué trajo la extensión PRF, sin bytes: { claves: [nombres de extensiones], enabled: true/false/null, results: true/false }. */
export function infoPrf(cred) {
  try {
    const ext = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : null;
    const p = ext && ext.prf;
    return { claves: ext ? Object.keys(ext).slice(0, 6) : [], enabled: p && typeof p.enabled === 'boolean' ? p.enabled : null, results: !!(p && p.results && p.results.first) };
  } catch { return null; }
}
/** Diagnóstico anónimo para el Worker (POST /pk/diag): SOLO etapa, error (name y message recortados), navigator.userAgent y qué claves trajo la extensión
 *  (nunca bytes, ni usuario, ni credId, ni h). Nunca lanza ni espera. Etapas: crear, get-tras-crear, sin-prf, subir, entrar-get, sin-ranura, entrar-post. */
export function diag(etapa, err, prf = null) {
  try {
    const e = err ? `${err.name || 'Error'}: ${err.message || ''}`.slice(0, 120) : '';
    fetch('/pk/diag', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapa, error: e, ua: String(navigator.userAgent || '').slice(0, 160), prf }) }).catch(() => {});
  } catch {}
}

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
  if (e && e.name === 'InvalidStateError') return new ErrorHuella('yaexiste', 'Este celular ya tiene la huella activada.', e);
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return new ErrorHuella('cancelado', 'No se pudo leer la huella. Intenta otra vez.', e);
  if (e && e.name === 'NotSupportedError') return new ErrorHuella('sinprf', msgSinPrf(), e);
  return new ErrorHuella('otro', 'No se pudo usar la huella en este celular. Sigue con tu clave.', e);
}

function salidaPrf(cred) {
  const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
  const p = ext && ext.prf;
  const r = p && p.results && p.results.first;
  return { hay: !!p, habilitada: !!(p && p.enabled !== false), prf: r ? new Uint8Array(r) : null };
}

/** Pide una aserción (huella o cara). Sin credId = credencial descubrible (el celular deja elegir la cuenta). `challenge` = bytes.
 *  Devuelve { credId, h (hex del userHandle o null), prf (32 bytes o null), authData, clientData, sig, userHandle, info } (todo Uint8Array salvo info).
 *  Con la sal ya calculada (crear() la calcula antes) el get se llama en el mismo turno que el toque, sin ningún await antes: WebKit (iOS) lo exige. */
export async function pedir({ challenge, credId = null }) {
  const s0 = _sal || await sal();
  const publicKey = { challenge, userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: s0 } } } };
  if (credId) publicKey.allowCredentials = [{ type: 'public-key', id: credId }];
  let a;
  try { a = await navigator.credentials.get({ publicKey }); } catch (e) { throw traduce(e); }
  const r = a.response, uh = r.userHandle ? new Uint8Array(r.userHandle) : null;
  return {
    credId: new Uint8Array(a.rawId), h: uh && uh.length === 32 ? aHex(uh) : null, prf: salidaPrf(a).prf, info: infoPrf(a),
    authData: new Uint8Array(r.authenticatorData), clientData: new Uint8Array(r.clientDataJSON), sig: new Uint8Array(r.signature), userHandle: uh,
  };
}

/** Crea la passkey de este celular (userHandle = bytes de h) y devuelve { credId, prf, spki, alg }. Si la creación no trae el resultado PRF
 *  (Apple no lo trae al crear) se hace de inmediato un get con esa credencial. WebKit exige un toque del usuario para ese get: si lo rechaza
 *  (NotAllowedError) se llama a `pedirToque(accion)`, que la pantalla usa para mostrar "Tocar de nuevo para terminar" y ejecutar `accion()` DENTRO del toque.
 *  Si algo falla después de crear, la passkey queda huérfana: se avisa al celular para que la borre. Cada falla manda un diagnóstico anónimo. */
export async function crear({ h, name, displayName, excluir = [], pedirToque = null }) {
  await sal();
  const publicKey = {
    rp: { id: location.hostname, name: 'Club Náutico' },
    user: { id: hexAbytes(h), name, displayName },          // name 'Club Náutico' y displayName 'Sofía · Club Náutico': distingue hermanos sin el apellido
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],          // ES256 (lo que verifica el Worker para profesores)
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required', authenticatorAttachment: 'platform' },
    attestation: 'none', timeout: 120000,
    excludeCredentials: excluir.map((id) => ({ type: 'public-key', id })),
    extensions: { prf: { eval: { first: _sal } } },
  };
  let c;
  try { c = await navigator.credentials.create({ publicKey }); } catch (e) { diag('crear', e); throw traduce(e); }
  const credId = new Uint8Array(c.rawId), info = infoPrf(c);
  const s = salidaPrf(c);
  if (info && info.enabled === false) { diag('sin-prf', null, info); await avisarQuitada(credId); throw new ErrorHuella('sinprf', msgSinPrf()); }
  let prf = s.prf;
  for (let intento = 0; !prf && intento < 3; intento++) {
    try { prf = (await pedir({ challenge: crypto.getRandomValues(new Uint8Array(32)), credId })).prf; break; }
    catch (e) {
      diag('get-tras-crear', e.causa || e, info);
      const sinGesto = e instanceof ErrorHuella && e.causa && e.causa.name === 'NotAllowedError';
      if (!sinGesto || !pedirToque) { await avisarQuitada(credId); throw e; }
      try { prf = (await pedirToque(() => pedir({ challenge: crypto.getRandomValues(new Uint8Array(32)), credId }))).prf; break; }
      catch (e2) {
        diag('get-tras-crear', e2.causa || e2, info);
        if (!(e2 instanceof ErrorHuella && e2.codigo === 'cancelado') || intento === 2) { await avisarQuitada(credId); throw e2; }
      }
    }
  }
  if (!prf || prf.length !== 32) { diag('sin-prf', null, info); await avisarQuitada(credId); throw new ErrorHuella('sinprf', msgSinPrf()); }
  const alg = c.response.getPublicKeyAlgorithm ? c.response.getPublicKeyAlgorithm() : -7;
  const spki = c.response.getPublicKey ? new Uint8Array(c.response.getPublicKey()) : null;
  if (alg !== -7 || !spki) { diag('crear', { name: 'Algoritmo', message: 'alg ' + alg + (spki ? '' : ' sin spki') }, info); await avisarQuitada(credId); throw new ErrorHuella('otro', 'Este celular no sirve para la huella. Sigue con tu clave.'); }
  return { credId, prf, spki, alg };
}

/** Intenta que el celular olvide una passkey que ya no sirve (solo un aviso al navegador; no todos lo entienden). */
export async function avisarQuitada(credId) {
  try { if (window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential) await PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: bytesAb64u(credId) }); } catch {}
}
