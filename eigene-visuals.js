// Emmos eigene Visuals als echte Butterchurn-Presets: die sieben früheren eigenen Shader (Build 126) und fünf neue (Build 127).
// Bis Build 125 liefen sie als „eigene Shader“ auf einer zweiten Zeichenfläche in halber Auflösung (acid-shader.js, js/03).
// Jetzt stehen sie in der normalen Preset-Liste: wischen, Stern, mixen, Lastbremse, Bild-Wächter wie bei jedem anderen Preset.
// Die Namen sind dieselben wie vorher („Eigen · …“), damit gesetzte Sterne bleiben.
//
// Die Bildformeln sind 1:1 übernommen. Nur die Anschlüsse an die Musik laufen jetzt über Butterchurn und die Klangrollen
// (AK_VAR_NAMES, im Shader verfügbar über AK-PATCH 6):
//   u_bass  → kick_env        (Kick, 0..1 relativ zum Maximum der letzten 30 s)
//   u_mid   → acid_env        (303-Linie)
//   u_treb  → hats_env        (Hi-Hats)
//   u_beat  → kick_hit        (springt auf jeden Kick, fällt schnell)
//   u_bar   → aus ak_bar       (springt auf jede Takt-Eins, fällt in ca. 0,25 s)
//   u_build → ak_build_strength (gemessener Aufbau vor dem Drop)
//   u_hue, u_v, u_w → rand_preset (bei jedem Einblenden neu: jede Vorstellung ist eine andere Variante, wie seit Build 116)
//   Rauschen → sampler_noise_lq (256×256, wie das eigene Zufallsbild vorher)
// Echo-Ring: die Spur läuft jetzt im Warp-Durchgang von Butterchurn (Rückkopplung wie in Milkdrop), das Leuchten im Comp mit den Blur-Bildern.
(function () {
  const none = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '' }));
  const noWave = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '', point_eqs_str: '' }));
  // Keine eingebauten Milkdrop-Teile: keine Welle, keine Ränder, keine Bewegungsvektoren, kein Zoom/Drehen im Gitter (das machen die Shader selbst)
  const BASE = { rating: 5, gammaadj: 1, decay: 1, zoom: 1, rot: 0, warp: 0, wrap: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_size: 0, ob_a: 0, ib_size: 0, ib_a: 0,
    mv_a: 0, darken_center: 0, brighten: 0, darken: 0, solarize: 0, invert: 0 };
  // Gemeinsamer Kopf (steht vor shader_body, Butterchurn setzt ihn vor main): Namen der alten Werte und die Hilfsfunktionen
  const HEAD = `
#define u_time time
#define u_res texsize.xy
#define u_bass clamp(kick_env, 0.0, 1.0)
#define u_mid clamp(acid_env, 0.0, 1.0)
#define u_treb clamp(hats_env, 0.0, 1.0)
#define u_beat clamp(kick_hit, 0.0, 1.0)
#define u_bar exp(-ak_bar * 960.0 / max(ak_bpm, 60.0))
#define u_build clamp(ak_build_strength, 0.0, 1.0)
#define u_hue fract(rand_preset.x + time * 0.003)
#define u_flash 1.0
#define u_v rand_preset
#define u_w fract(rand_preset.yzwx * 7.13 + 0.37)
vec3 eiHsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
float eiHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float eiNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return textureLod(sampler_noise_lq, (i + f + 0.5) / 256.0, 0.0).r; }
vec2 eiUvc() { return (gl_FragCoord.xy - 0.5 * u_res) / u_res.y; }
float eiHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
  const BLACK_WARP = 'shader_body { ret = vec3(0.0); }';   // Bild entsteht ganz im Comp: der Warp-Durchgang schreibt nur Schwarz (billig)
  const mk = (comp, warp, eq) => ({ baseVals: Object.assign({}, BASE), init_eqs_str: eq ? eq.init : '', frame_eqs_str: eq ? eq.frame : '', pixel_eqs_str: '', shapes: none(4), waves: noWave(4),
    warp: warp || BLACK_WARP, comp });
  const V = {};

  /* ---------- PEAK TIME: groß, hell, Stadion ---------- */

  // 1) Strahlen: Lichtstrahlen aus der Mitte, Ring bei jedem Kick, Aufleuchten auf der Takt-Eins
  V['Eigen · Peak · Strahlen'] = mk(HEAD + `
shader_body {
  vec2 p = eiUvc() - (u_v.zw - 0.5) * 0.35;
  float r = length(p);
  float a = atan(p.y, p.x);
  float wob = sin(r * 4.0 - u_time * 1.2) * (0.8 + u_mid);
  float rays = 0.5 + 0.5 * sin(a * floor(8.0 + 16.0 * u_v.x) + u_time * 0.5 + wob + (u_v.y - 0.5) * 8.0 * r);
  rays = pow(rays, 2.0 + 5.0 * (1.0 - u_bass));
  float fade = exp(-r * 1.6);
  float rRing = 1.1 * (1.0 - u_beat);
  float ring = exp(-abs(r - rRing) * 14.0) * u_beat;
  float core = 0.05 / (r + 0.05) * (0.5 + 0.8 * u_bass);
  float h = u_hue + 0.08 * r + 0.05 * sin(a * 3.0);
  vec3 col = eiHsv(h, 0.55, 1.0) * (rays * fade * (0.8 + u_build) + core);
  col += eiHsv(h + 0.12, 0.35, 1.0) * ring * 1.2;
  col *= 1.0 + 0.6 * u_bar * u_flash;
  col += vec3(1.0) * u_treb * 0.08 * fade;
  ret = col;
}`);

  // 2) Lichtwand: Säulen wie eine LED-Wand, Höhe tanzt mit Kick/303/Hats; jede Vorstellung eine eigene Variante (Build 116)
  //    (12-31 Säulen, 14-47 Segmente, Aufbau von unten / von der Mitte / Bass in der Mitte, Farbspanne, Lücken, Bogen, Muster in den Kästchen)
  V['Eigen · Peak · Lichtwand'] = mk(HEAD + `
shader_body {
  vec2 q = gl_FragCoord.xy / u_res;
  float n = floor(12.0 + 20.0 * u_v.x);
  float segN = floor(14.0 + 34.0 * u_v.y);
  float mode = floor(u_v.z * 2.999);
  float pat = floor(u_v.w * 4.999);
  float gx = mode > 1.5 ? abs(q.x - 0.5) * 2.0 : q.x;
  float y = (mode > 0.5 && mode < 1.5) ? abs(q.y - 0.5) * 2.0 : q.y;
  y += (u_w.z - 0.5) * 0.5 * sin(q.x * 3.14159);
  float col_i = floor(gx * n);
  float cx = fract(gx * n);
  float seed = eiHash(vec2(col_i, 1.0 + u_w.w));
  float band = col_i / n;
  float lvl = mix(u_bass, mix(u_mid, u_treb, smoothstep(0.5, 1.0, band)), smoothstep(0.0, 0.5, band));
  float hgt = 0.12 + 0.75 * lvl * (0.6 + 0.4 * sin(u_time * 3.0 + seed * 20.0)) + 0.1 * u_beat;
  float gap = 0.04 + 0.16 * u_w.y;
  float bar = step(y, hgt) * step(gap, cx) * step(cx, 1.0 - gap);
  float sy = fract(y * segN);
  float seg = step(0.25, sy);
  vec2 cell = vec2((cx - gap) / (1.0 - 2.0 * gap), (sy - 0.25) / 0.75);
  vec2 cid = vec2(col_i, floor(y * segN));
  float tx;
  if (pat < 0.5) tx = 0.5 + 0.5 * sin(q.x * 13.0 + u_time * 1.4 + 3.0 * sin(q.y * 9.0 - u_time * 0.9) + 4.0 * u_mid);
  else if (pat < 1.5) tx = smoothstep(0.35, 0.65, fract((cell.x + cell.y) * 1.5 - q1));
  else if (pat < 2.5) tx = smoothstep(0.18, 0.0, abs(length(cell - 0.5) - 0.12 - 0.3 * u_beat));
  else if (pat < 3.5) tx = 0.25 + 0.75 * step(1.0 - 0.15 - 0.5 * u_treb, eiHash(cid + floor(u_time * 3.0)));
  else tx = eiNoise(cid * 0.6 + cell * 1.5 + vec2(0.0, q2));
  float h = u_hue + band * (0.1 + 0.7 * u_w.x) + y * 0.1;
  float sat = 0.55 + 0.35 * u_w.w;
  float glow = exp(-abs(y - hgt) * 18.0) * 0.6;
  vec3 c = eiHsv(h, sat, 1.0) * (bar * seg * (0.55 + 0.6 * tx) * (0.7 + 0.3 * y) + glow);
  c += eiHsv(h + 0.5, sat, 1.0) * bar * seg * tx * 0.15 * u_mid;
  c *= 1.0 + 0.4 * u_bar * u_flash;
  c *= 0.85 + 0.3 * u_build;
  ret = c;
}`, null, { init: 'a.tp=0;a.p1=0;a.p2=0;a.q1=0;a.q2=0;', frame: 'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;a.p1+=a.dt*(.8+2.2*Math.min(1,Math.max(0,a.hats_env)));a.p2+=a.dt*(.4+1.2*Math.min(1,Math.max(0,a.kick_env)));a.q1=a.p1;a.q2=a.p2;' });

  /* ---------- DRIVING: hypnotisch, Tunnel, Sog (kaum Blitze, Pulsieren) ---------- */

  // 3) Sog-Tunnel: endloser Tunnel mit Gitter, pulsiert leise mit dem Kick
  V['Eigen · Driving · Sog-Tunnel'] = mk(HEAD + `
shader_body {
  vec2 p = eiUvc();
  p += 0.03 * vec2(sin(u_time * 0.3), cos(u_time * 0.23));
  float r = length(p) + 0.0001;
  float a = atan(p.y, p.x) / 6.2831853;
  float z = 0.35 / r + u_time * (0.35 + 0.45 * u_v.y);
  float w = a * floor(6.0 + 10.0 * u_v.x) + 0.3 * sin(z * 0.7) + (u_v.z - 0.5) * 0.6 / r;
  float gz = abs(fract(z) - 0.5);
  float gw = abs(fract(w) - 0.5);
  float line = smoothstep(0.06, 0.0, gz) + smoothstep(0.04, 0.0, gw) * 0.6;
  float fog = smoothstep(0.0, 0.5, r);
  float pulse = 0.65 + 0.35 * u_beat + 0.2 * u_bass;
  float h = u_hue + 0.04 * sin(z * 0.5);
  vec3 c = eiHsv(h, 0.65, 1.0) * line * fog * pulse;
  c += eiHsv(h + 0.3 + 0.4 * u_v.w, 0.5, 0.25) * (1.0 - fog) * 0.6;
  c += vec3(0.04, 0.04, 0.06);
  c *= 0.85 + 0.4 * u_build;
  ret = c;
}`);

  // 4) Rumble-Nebel: dunkler, langsamer Nebel, der mit dem Rumpeln atmet
  V['Eigen · Driving · Rumble-Nebel'] = mk(HEAD + `
float eiFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * eiNoise(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
shader_body {
  vec2 p = eiUvc() * (1.5 + 1.5 * u_v.x);
  float t = u_time * (0.05 + 0.07 * u_v.z);
  vec2 q = vec2(eiFbm(p + t), eiFbm(p + vec2(5.2, 1.3) - t));
  float f = eiFbm(p + 2.0 * q + vec2(0.0, t * 2.0) + 0.6 * u_bass);
  float dens = smoothstep(0.25, 0.9, f);
  float h = u_hue + 0.1 * q.x;
  vec3 c = eiHsv(h, 0.6, 1.0) * dens * (0.35 + 0.55 * u_bass + 0.2 * u_beat);
  c += eiHsv(h + 0.2 + 0.6 * u_v.y, 0.5, 1.0) * pow(dens, 3.0) * 0.4 * u_mid;
  float vig = 1.0 - 0.9 * dot(eiUvc(), eiUvc());
  c *= clamp(vig, 0.0, 1.0);
  c *= 0.9 + 0.5 * u_build;
  ret = c;
}`);

  /* ---------- ACID: giftig, quietschend, verdreht (Farbe springt mit der 303) ---------- */

  // 5) 303-Welle: verdrehtes Plasma, die 303 verbiegt das Bild und dreht die Farbe
  V['Eigen · Acid · 303-Welle'] = mk(HEAD + `
shader_body {
  vec2 p = eiUvc() * (2.0 + 2.0 * u_v.x);
  float k = 0.5 + 1.3 * u_mid;
  float fq = 1.0 + 0.8 * u_v.y;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    p += k * vec2(sin(p.y * fq + u_time * 0.7 + fi), cos(p.x * fq - u_time * 0.6 + fi * 1.7)) * 0.55;
  }
  float v = sin(p.x * 2.0) + sin(p.y * 2.0) + sin((p.x + p.y) * 1.5);
  float band = 0.5 + 0.5 * sin(v * (2.0 + 3.0 * u_v.z) + u_time);
  float edge = smoothstep(0.35, 0.0, abs(band - 0.5));
  float h = u_hue + v * 0.12 + u_mid * 0.35;
  vec3 c = eiHsv(h, 1.0, 1.0) * (0.25 + 0.75 * band);
  c += eiHsv(h + 0.2 + 0.3 * u_v.w, 1.0, 1.0) * edge * (0.5 + 0.8 * u_beat);
  c *= 1.0 + 0.35 * u_bar * u_flash;
  c *= 0.85 + 0.5 * u_build;
  ret = c;
}`);

  // 6) Säure-Kaleidoskop: gespiegelte Segmente, Farbsäume (RGB leicht versetzt)
  V['Eigen · Acid · Säure-Kaleidoskop'] = mk(HEAD + `
float eiPat(vec2 p, float t) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float seg = 6.2831853 / floor(4.0 + 8.0 * u_v.x);
  a = abs(mod(a, seg) - 0.5 * seg);
  vec2 q = r * vec2(cos(a), sin(a));
  float sc = 0.7 + 0.6 * u_v.y;
  float v = sin(q.x * 9.0 * sc + t) + sin(q.y * 11.0 * sc - t * 1.3) + sin(r * 14.0 * sc - t * 2.0);
  return 0.5 + 0.5 * sin(v * 2.0 + u_mid * 4.0);
}
shader_body {
  vec2 p = eiUvc();
  float dr = u_v.z < 0.5 ? -0.15 : 0.15;
  float s = sin(u_time * dr), c0 = cos(u_time * dr);
  p = mat2(c0, -s, s, c0) * p;
  p *= 1.0 + 0.25 * u_beat - 0.1 * u_build;
  float off = 0.01 + 0.03 * u_treb + 0.02 * u_beat;
  float t = u_time * 0.8;
  float vr = eiPat(p + vec2(off, 0.0), t);
  float vg = eiPat(p, t);
  float vb = eiPat(p - vec2(off, 0.0), t);
  vec3 base = eiHsv(u_hue + 0.1 * length(p), 0.9, 1.0);
  vec3 col = vec3(vr, vg, vb) * base;
  col += base.zxy * pow(vg, 6.0) * 0.6;
  col *= 1.0 + 0.35 * u_bar * u_flash;
  col *= 0.85 + 0.4 * u_build;
  ret = col;
}`);

  /* ---------- MILKDROP-PRINZIP: Nachzieh-Spur + Leuchten ---------- */

  // 7) Echo-Ring: das alte Bild wird jedes Mal leicht gezoomt, gedreht, gewellt und abgedunkelt (Spur); neu gezeichnet wird nur ein tanzender Ring.
  //    Warp-Durchgang = Rückkopplung (wie Milkdrop), Comp = Leuchten aus Butterchurns Blur-Bildern (vorher eigener Glow-Durchgang).
  V['Eigen · Acid · Echo-Ring'] = mk(HEAD + `
shader_body {
  vec3 c = texture(sampler_main, uv).rgb;
  vec3 g = 0.6 * (texture(sampler_blur1, uv).xyz * scale1 + bias1) + 0.6 * (texture(sampler_blur2, uv).xyz * scale2 + bias2);
  vec3 col = c + g * (0.8 + 0.6 * u_build);
  col *= 1.0 + 0.35 * u_bar * u_flash;
  col = col / (1.0 + 0.25 * col);
  ret = col;
}`, HEAD + `
shader_body {
  float asp = texsize.x / texsize.y;
  vec2 p = (uv_orig - 0.5) * vec2(asp, 1.0);
  float zm = 1.012 + 0.035 * u_bass + 0.03 * u_build;
  float rt = 0.004 * sin(u_time * 0.21) + 0.014 * (u_mid - 0.5) + (u_w.x - 0.5) * 0.01;
  float cs = cos(rt), sn = sin(rt);
  vec2 q = mat2(cs, -sn, sn, cs) * p / zm;
  float wa = 0.003 + 0.006 * u_treb;
  q += wa * vec2(sin(u_time * 0.9 + q.y * 9.0), cos(u_time * 0.77 + q.x * 8.0));
  vec3 prev = texture(sampler_main, q / vec2(asp, 1.0) + 0.5).rgb;
  float dk = 0.90 + 0.06 * u_build;
  prev = max(prev * dk - 1.5 / 255.0, 0.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float wob = 0.06 * (0.4 + u_mid) * sin(a * floor(3.0 + 6.0 * u_v.x) + u_time * (u_v.z < 0.5 ? -2.0 : 2.0)) + 0.03 * u_treb * sin(a * floor(9.0 + 8.0 * u_v.y) - u_time * 5.0);
  float rRing = 0.11 + 0.1 * u_v.w + 0.12 * u_bass + wob;
  float w = 0.004 + 0.010 * u_beat;
  float line = smoothstep(w, 0.0, abs(r - rRing));
  vec3 ink = eiHsv(u_hue + u_time * 0.03 + a * 0.08, 0.85, 1.0) * line * (0.7 + 0.6 * u_beat);
  ret = min(prev + ink, 1.0);
}`);

  /* ---------- NEU (Build 127): fünf Presets, die die Klangrollen einzeln hören ---------- */
  // Wo ein Tempo von der Musik abhängt, wird die Phase in den Frame-Gleichungen aufsummiert (q-Werte): „time × Tempo“ würde bei jeder
  // Tempo-Änderung springen, weil time seit dem Start der App läuft (nach 30 Minuten 1800 s).
  const DT = 'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;';
  const cl = v => 'Math.min(1,Math.max(0,' + v + '))';

  // 8) 303-Säureschlange: eine leuchtende Linie windet sich übers Bild. Öffnet sich der 303-Filter (acid_cutoff), wird sie wilder,
  //    bei hoher Resonanz (acid_reso) bekommt sie Zacken und glüht; schnelle Filterfahrten (acid_squelch) treiben sie an. Spur im Warp.
  V['Eigen · Acid · Säureschlange'] = mk(HEAD + `
shader_body {
  vec3 c = texture(sampler_main, uv).rgb;
  vec3 g = 0.7 * (texture(sampler_blur1, uv).xyz * scale1 + bias1) + 0.5 * (texture(sampler_blur2, uv).xyz * scale2 + bias2);
  vec3 col = c + g * (0.7 + 0.8 * clamp(acid_reso, 0.0, 1.0));
  col *= 1.0 + 0.3 * u_bar;
  ret = col / (1.0 + 0.3 * col);
}`, HEAD + `
shader_body {
  float asp = texsize.x / texsize.y;
  vec2 p = (uv_orig - 0.5) * vec2(asp, 1.0);
  float sq = clamp(acid_squelch, 0.0, 1.0), co = clamp(acid_cutoff, 0.0, 1.0), rs = clamp(acid_reso, 0.0, 1.0);
  float rt = (0.002 + 0.012 * sq) * (u_v.w < 0.5 ? -1.0 : 1.0);
  float cs = cos(rt), sn = sin(rt);
  vec2 q = mat2(cs, -sn, sn, cs) * p / (1.006 + 0.012 * u_bass);
  vec3 prev = texture(sampler_main, q / vec2(asp, 1.0) + 0.5).rgb;
  prev = max(prev * (0.87 + 0.07 * u_mid) - 1.0 / 255.0, 0.0);
  float f1 = 2.0 + 6.0 * co + 3.0 * u_v.x;
  float ph = q1 + u_v.y * 6.2831853;
  float x = p.x;
  float yS = 0.28 * (0.3 + 0.7 * u_mid) * sin(x * f1 + ph) + 0.08 * sin(x * f1 * 2.3 - ph * 1.7 + u_v.z * 6.2831853);
  yS += rs * 0.06 * (abs(fract(x * (10.0 + 30.0 * co) + time * 2.0) - 0.5) * 2.0 - 0.5);
  float w = 0.004 + 0.006 * u_mid + 0.004 * rs;
  float line = smoothstep(w, 0.0, abs(p.y - yS));
  vec3 ink = eiHsv(u_hue + 0.25 + 0.15 * co + 0.1 * x, 0.9 - 0.4 * rs, 1.0) * line * (0.6 + 0.8 * u_mid + 0.6 * rs);
  ret = min(prev + ink, 1.0);
}`, { init: 'a.tp=0;a.ph=0;a.q1=0;', frame: DT + 'a.ph+=a.dt*(.6+2.5*' + cl('a.acid_squelch') + ');a.q1=a.ph;' });

  // 9) Kick-Schockwelle: jeder Kick schickt eine Welle durch ein Gitter, die Spur bleibt kurz stehen (Warp).
  //    Im Drop (ak_section 3) ist die Welle stärker, je nachdem, wie heftig der Drop gemessen wurde (ak_drop_strength).
  V['Eigen · Peak · Kick-Schockwelle'] = mk(HEAD + `
shader_body {
  vec3 c = texture(sampler_main, uv).rgb;
  vec3 g = texture(sampler_blur1, uv).xyz * scale1 + bias1;
  vec3 col = c + g * 0.6;
  col *= 1.0 + 0.4 * u_bar;
  ret = col / (1.0 + 0.2 * col);
}`, HEAD + `
shader_body {
  float asp = texsize.x / texsize.y;
  vec2 p = (uv_orig - 0.5) * vec2(asp, 1.0);
  vec3 prev = max(texture(sampler_main, uv_orig).rgb * 0.74 - 2.0 / 255.0, 0.0);
  float drop = step(2.5, ak_section) * clamp(ak_drop_strength, 0.0, 1.0);
  float r = length(p);
  float ringR = (1.0 - u_beat) * 0.95;
  float wave = exp(-pow((r - ringR) * 15.0, 2.0)) * u_beat;
  vec2 dir = p / max(r, 1e-4);
  vec2 gp = p + dir * wave * (0.12 + 0.2 * drop);
  float cells = 8.0 + 8.0 * u_v.x;
  vec2 gg = abs(fract(gp * cells + vec2(time * 0.03, 0.0)) - 0.5);
  float lw = 0.035 + 0.05 * wave;
  float grid = max(smoothstep(lw, 0.0, gg.x), smoothstep(lw, 0.0, gg.y));
  vec3 base = eiHsv(u_hue + 0.55 + 0.1 * wave, 0.65, 1.0);
  float pe = clamp(pads_env, 0.0, 1.0);
  vec3 ink = base * grid * (0.05 + 0.03 * pe * (0.5 + 0.5 * sin(time * 1.3)) + 0.9 * wave + 0.03 * u_bass);
  ink += eiHsv(u_hue + 0.05, 0.35, 1.0) * wave * (0.25 + 0.6 * drop);
  ink += base * (0.035 + 0.02 * pe) * exp(-r * 2.2);
  ink += vec3(0.03) * (0.5 * grid + exp(-r * 1.8));            // neutrales Grundlicht: auch dunkle Farbvarianten bleiben im Break sichtbar (Bild-Wächter)
  ret = min(prev + ink, 1.0);
}`);

  // 10) Hats-Sternenfeld links/rechts: Hi-Hats lassen Sterne aufblitzen (hats_hit), schnelle Hats geben mehr (hats_density),
  //     springen die Hats im Stereo hin und her (ak_pan), blitzen die Sterne auf der Seite, wo sie klingen. Sterne treiben nach außen (Warp).
  V['Eigen · Peak · Hats-Sternenfeld'] = mk(HEAD + `
shader_body {
  vec3 c = texture(sampler_main, uv).rgb;
  vec3 g = texture(sampler_blur1, uv).xyz * scale1 + bias1;
  vec2 p = (uv - 0.5) * vec2(texsize.x / texsize.y, 1.0);
  float neb = eiNoise(p * 3.0 + time * 0.02) * eiNoise(p * 7.0 - time * 0.03);
  vec3 bg = eiHsv(u_hue + 0.62, 0.7, 1.0) * (0.05 + 0.12 * neb + 0.05 * u_bass * exp(-length(p) * 2.0));   // ohne Hats ein dunkler Nebel, kein leeres Schwarz
  vec3 col = c + g * 0.8 + bg;
  ret = col / (1.0 + 0.25 * col);
}`, HEAD + `
shader_body {
  float asp = texsize.x / texsize.y;
  vec2 p = (uv_orig - 0.5) * vec2(asp, 1.0);
  vec2 q = p / (1.010 + 0.015 * u_bass);
  vec3 prev = max(texture(sampler_main, q / vec2(asp, 1.0) + 0.5).rgb * 0.90 - 1.0 / 255.0, 0.0);
  vec2 n = vec2(48.0, 27.0);
  vec2 cell = floor(uv_orig * n), f = fract(uv_orig * n);
  float ep = floor(time * 15.0);
  float side = clamp(1.0 + 1.6 * ak_pan * (uv_orig.x * 2.0 - 1.0), 0.0, 2.6);
  float pr = (0.004 + 0.05 * clamp(hats_density, 0.0, 1.0)) * smoothstep(0.05, 0.6, clamp(hats_hit, 0.0, 1.0)) * side;
  float h = eiHash2(cell + vec2(ep * 1.37, ep * 0.71));
  vec2 pos = vec2(eiHash2(cell * 1.7 + ep), eiHash2(cell * 2.3 - ep)) * 0.7 + 0.15;
  float star = (pr > h ? 1.0 : 0.0) * smoothstep(0.22, 0.0, length(f - pos));
  vec3 ink = eiHsv(u_hue + 0.5 + 0.2 * h, 0.3, 1.0) * star * 1.4;
  ret = min(prev + ink, 1.0);
}`);

  // 11) Pad-Nebel: weiche Farbflächen, die im Break aufblühen (pads_env, ak_section 1). Tiefe Pads = dunkle, satte Farben,
  //     hohe Pads = helle (pads_pitch). Adern im Nebel halten den Kontrast (sonst hielte der Bild-Wächter ihn für eine flache Fläche).
  V['Eigen · Driving · Pad-Nebel'] = mk(HEAD + `
float eiFbm5(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * eiNoise(p); p = p * 2.1 + vec2(11.3, 7.7); a *= 0.5; } return s; }
shader_body {
  vec2 p = eiUvc() * (1.2 + 0.8 * u_v.x);
  float t = time * (0.03 + 0.04 * u_v.y);
  float pe = clamp(pads_env, 0.0, 1.0), pitch = clamp(pads_pitch, 0.0, 1.0);
  float brk = 1.0 - min(1.0, abs(ak_section - 1.0));
  float bloom = 0.4 + 0.6 * pe + 0.35 * brk * pe;
  vec2 w = vec2(eiFbm5(p + t), eiFbm5(p - t + 3.7));
  float f = eiFbm5(p * 1.3 + 2.5 * w + vec2(t * 2.0, 0.0));
  vec3 dunkel = eiHsv(u_hue * 0.3 + 0.72, 0.85, 0.6), hell = eiHsv(u_hue * 0.3 + 0.48, 0.35, 1.0);
  vec3 farbe = mix(dunkel, hell, pitch);
  float adern = smoothstep(0.42, 0.72, f);
  vec3 col = farbe * (0.2 + 0.8 * adern) * bloom;
  col += vec3(0.07) * f;                                     // neutraler Schimmer der Struktur: auch dunkle Varianten (Violett/Blau) bleiben sichtbar
  col += mix(dunkel, hell, 1.0 - pitch) * pow(max(f - 0.55, 0.0) * 2.2, 3.0) * 0.7 * bloom;
  col *= 0.9 + 0.15 * u_bass;
  ret = col * clamp(1.0 - 0.6 * dot(eiUvc(), eiUvc()), 0.0, 1.0);
}`);

  // 12) Phrasen-Mandala: macht die 16-Takt-Phrase sichtbar. Mit jedem Takt wächst ein neuer Ring aus Blütenblättern dazu (ak_phrase),
  //     die Ringe drehen abwechselnd in Gegenrichtung; am Phrasenende leuchtet das Mandala auf und beginnt mit der nächsten Phrase neu.
  //     Im Drop steht es voll da und pulsiert mit dem Kick. (Build 127: ersetzt den Phrasen-Tunnel, der Emmos Sog-Tunnel zu ähnlich war.)
  V['Eigen · Driving · Phrasen-Mandala'] = mk(HEAD + `
shader_body {
  vec2 p = eiUvc();
  float r = length(p), a = atan(p.y, p.x);
  float ph = clamp(ak_phrase, 0.0, 0.999) * 16.0;
  float drop = step(2.5, ak_section);
  float nb = mix(floor(ph), 15.0, drop), fr = mix(fract(ph), 1.0, drop);
  float rw = 0.042, k = floor((r - 0.04) / rw), inR = fract((r - 0.04) / rw);
  vec3 col = vec3(0.0);
  if (k >= 0.0 && k <= nb && k < 16.0) {
    float grow = k < nb ? 1.0 : smoothstep(0.0, 1.0, fr);
    float petals = 4.0 + 2.0 * mod(k + floor(u_v.x * 4.0), 5.0);
    float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
    float pa = a * petals + dir * time * (0.15 + 0.1 * u_v.y) + k * 0.7;
    float band = smoothstep(0.0, 0.15, inR) * smoothstep(1.0, 0.8, inR);
    float petal = pow(0.5 + 0.5 * cos(pa), 3.0 - 1.5 * grow) * band * grow;
    float edge = smoothstep(0.08, 0.0, abs(inR - 0.04)) * grow;
    col = eiHsv(u_hue + k * 0.045 + 0.1 * u_mid, 0.75, 1.0) * (petal * (0.7 + 0.5 * u_beat * (0.6 + 0.4 * drop)) + 0.25 * edge);
  } else if (k >= 0.0 && k < 16.0) {
    col = eiHsv(u_hue + k * 0.045, 0.5, 1.0) * 0.16 * smoothstep(0.1, 0.0, abs(inR - 0.04));   // die noch kommenden Ringe als feine Umrisse
  }
  float ende = smoothstep(14.5, 16.0, ph) * (1.0 - drop);
  col *= 1.0 + 1.5 * ende;
  col += eiHsv(u_hue + 0.1, 0.25, 1.0) * ende * exp(-r * 4.0);
  col += eiHsv(u_hue + 0.5, 0.6, 1.0) * (0.11 + 0.05 * u_bass) * exp(-r * 1.3);
  ret = col;
}`);

  // Worauf jedes Visual reagiert [Bass, Mitten, Höhen] für die Auswahl nach Klang (js/05 REACT). GESCHÄTZT aus den Formeln (Build 126), nicht gemessen:
  // die Visuals hören über die Klangrollen (Kick/303/Hats), die Vorab-Messung mit Testtönen deckt diesen Weg nicht ab.
  window.EIGENE_REACT = {
    'Eigen · Peak · Strahlen': [1.2, 0.4, 0.3], 'Eigen · Peak · Lichtwand': [0.9, 0.7, 0.7], 'Eigen · Driving · Sog-Tunnel': [0.8, 0.1, 0.05],
    'Eigen · Driving · Rumble-Nebel': [0.9, 0.4, 0.05], 'Eigen · Acid · 303-Welle': [0.3, 1.2, 0.1], 'Eigen · Acid · Säure-Kaleidoskop': [0.4, 1.0, 0.4],
    'Eigen · Acid · Echo-Ring': [0.9, 0.6, 0.5], 'Eigen · Acid · Säureschlange': [0.3, 1.2, 0.1], 'Eigen · Peak · Kick-Schockwelle': [1.3, 0.2, 0.1],
    'Eigen · Peak · Hats-Sternenfeld': [0.4, 0.2, 1.2], 'Eigen · Driving · Pad-Nebel': [0.2, 0.9, 0.2], 'Eigen · Driving · Phrasen-Mandala': [0.7, 0.4, 0.2]
  };
  window.EIGENE_VISUALS = V;
  window.ACID_PRESETS = Object.assign(window.ACID_PRESETS || {}, V);
})();
