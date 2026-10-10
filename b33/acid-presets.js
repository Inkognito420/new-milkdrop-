// Eigene Acid-Techno-Presets für Acid Milkdrop (Butterchurn-Format).
// Alle drei sind von Grund auf gebaut: eigene Formeln, eigene Shader, eigene Farbwelt.
// Eingänge aus dem Ton: Kick (a.bass), 303-/Mitten-Linie (a.mid), Hats/Claps (a.treb, a.mid).
(function () {
  const none = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '' }));
  const noWave = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '', point_eqs_str: '' }));
  const P = {};

  // ---------- 1) Acid-Tunnel: pumpt mit dem Kick, Farbe wandert mit der 303-Linie ----------
  P['Acid \u00b7 Tunnel'] = {
    baseVals: { rating: 5, gammaadj: 1.6, decay: 0.92, zoom: 1.02, wrap: 0, warp: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0, darken_center: 0 },
    init_eqs_str: 'a.kk=0;a.ac=0;a.ph=0;a.hue=0;a.tp=0;a.dt=0;a.q1=0;a.q2=0;a.q3=0;a.q4=0;a.q5=0;',
    frame_eqs_str:
      'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;' +
      'a.kk=Math.max(a.kk*.84,Math.min(1.6,Math.max(0,a.bass-1.05)));' +            // Kick-Hüllkurve
      'a.ac=a.ac*.9+.1*Math.min(2,Math.max(0,a.mid-.9));' +                           // 303-Linie (weich)
      'a.ph+=a.dt*(.5+2.2*a.kk+.6*a.bass_att);' +                                     // Tunnelfahrt, Kick gibt Schub
      'a.hue+=a.dt*(.15+1.1*a.ac);' +                                                 // Farbwechsel folgt der 303
      'a.q1=a.kk;a.q2=a.ph;a.q3=a.ac;a.q4=a.hue;a.q5=Math.max(0,a.treb-1);' +
      'a.zoom=1.012+.05*a.kk;a.rot=.004*Math.sin(a.ph*.3)+.01*a.ac;' +
      'a.decay=.9+.04*(1-Math.min(1,a.kk));',
    pixel_eqs_str: 'a.zoom=a.zoom+.03*a.q1*a.rad*a.rad;a.rot=a.rot+.02*Math.sin(a.ang*4+a.q2)*a.q3*a.rad;',
    shapes: none(4),
    waves: [{
      baseVals: { enabled: 1, samples: 200, sep: 0, scaling: 1, smoothing: 0.5, thick: 1, additive: 1, usedots: 0, spectrum: 0, r: 0.7, g: 1, b: 0.1, a: 0.9 },
      init_eqs_str: 'a.q1=0;a.q3=0;a.q4=0;',
      frame_eqs_str: '',
      point_eqs_str: 'a.an=a.sample*6.2832;a.rd=.22+a.value1*.12*(1+a.q3*1.5)+.05*a.q1;a.x=.5+a.rd*Math.cos(a.an);a.y=.5+a.rd*Math.sin(a.an);a.r=.6+.4*Math.sin(a.q4);a.g=1;a.b=.1+.5*Math.max(0,Math.sin(a.q4*1.3));a.a=.5+.5*Math.min(1,a.q1);'
    }, ...noWave(3)],
    warp: '',
    comp: ` shader_body {
  vec3 c = texture(sampler_main, uv).xyz;
  float l = clamp(dot(c, vec3(0.3, 0.59, 0.11)) * 1.5, 0.0, 1.0);
  vec3 A = mix(vec3(0.0, 0.07, 0.0), vec3(0.78, 1.0, 0.08), l);
  vec3 B = mix(vec3(0.12, 0.0, 0.18), vec3(1.0, 0.18, 0.85), l);
  float m = smoothstep(0.75, 1.0, 0.5 + 0.5 * sin(q4 * 0.6));
  vec3 col = mix(A, B, m);
  col += vec3(0.9, 1.0, 0.8) * l * l * l * 0.6;
  float vg = 1.0 - 0.55 * dot(uv - 0.5, uv - 0.5) * 2.0;
  col *= (1.0 + 0.35 * q1) * vg;
  ret = col;
 }`
  };

  // ---------- 2) Kick-Gitter: Gitter-Raum, blitzt auf den Kick, flackert leicht auf Hats ----------
  P['Acid \u00b7 Kick-Gitter'] = {
    baseVals: { rating: 5, gammaadj: 1.4, decay: 0.84, zoom: 1.0, wrap: 0, warp: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0 },
    init_eqs_str: 'a.kk=0;a.hh=0;a.ph=0;a.tp=0;a.dt=0;a.q1=0;a.q2=0;a.q3=0;a.q5=0;',
    frame_eqs_str:
      'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;' +
      'a.kk=Math.max(a.kk*.82,Math.min(1.6,Math.max(0,a.bass-1.05)));' +
      'a.hh=Math.max(a.hh*.78,Math.min(1.5,Math.max(0,a.treb-1.05)));' +
      'a.ph+=a.dt*(.35+2.8*a.kk);' +                                                  // Gitter fährt, Kick gibt Schub
      'a.q1=a.kk;a.q2=a.ph;a.q3=Math.min(2,Math.max(0,a.mid-.9));a.q5=a.hh;' +
      'a.zoom=1+.02*a.kk;a.rot=.006*Math.sin(a.time*.4);',
    pixel_eqs_str: '',
    shapes: none(4),
    waves: [{
      baseVals: { enabled: 1, samples: 128, sep: 0, scaling: 1, smoothing: 0.5, thick: 1, additive: 1, usedots: 0, spectrum: 0, r: 1, g: 0.2, b: 0.8, a: 0.8 },
      init_eqs_str: 'a.q3=0;',
      frame_eqs_str: '',
      point_eqs_str: 'a.x=a.sample;a.y=.5+a.value1*.18*(1+a.q3);'
    }, ...noWave(3)],
    warp: '',
    comp: ` shader_body {
  vec3 base = texture(sampler_main, uv).xyz;
  vec2 p = uv - 0.5;
  p.x *= texsize.x * texsize.w;
  float y = abs(p.y) + 0.02;
  float z = 0.12 / y;
  vec2 gc = vec2(p.x * z * 3.0, z * 2.5 + q2);
  vec2 gd = abs(fract(gc - 0.5) - 0.5);
  vec2 fw = fwidth(gc) + 0.0001;
  vec2 ln = 1.0 - smoothstep(vec2(0.0), fw * 1.6, gd);
  float line = max(ln.x, ln.y) * clamp(1.0 - max(fw.x, fw.y) * 1.2, 0.0, 1.0);
  line *= exp(-z * 0.15);
  float flick = 1.0 + 0.25 * q5 * step(0.5, fract(sin(floor(time * 24.0)) * 43758.5453));
  float lvl = (0.22 + 1.5 * q1) * flick;
  vec3 gcol = mix(vec3(0.5, 1.0, 0.05), vec3(1.0, 1.0, 0.9), clamp(q1, 0.0, 1.0));
  vec3 col = base * 0.9 + gcol * line * lvl;
  col *= 1.0 + 0.2 * q1;
  ret = col;
 }`
  };

  // ---------- 3) Strobe-Ringe: Ringe wachsen bei jedem Snare/Clap, Bild blitzt kurz auf ----------
  const ring = i => ({
    baseVals: { enabled: 1, sides: 56, additive: 1, textured: 0, thickoutline: 1, x: 0.5, y: 0.5, rad: 0.1, r: 0, g: 0, b: 0, a: 0, r2: 0, g2: 0, b2: 0, a2: 0, border_r: 0.7, border_g: 1, border_b: 0.1, border_a: 0 },
    init_eqs_str: 'a.q1=99;a.q2=99;a.q3=99;a.q4=99;',
    frame_eqs_str:
      'a.age=a.q' + i + ';a.rad=.03+a.age*.8;a.border_a=Math.max(0,1-a.age*1.15);' +
      'a.border_r=.55+.45*Math.sin(a.age*3+' + i + ');a.border_g=1;a.border_b=.12+.6*Math.max(0,Math.sin(a.age*4+' + i + '*1.7));'
  });
  P['Acid \u00b7 Strobe-Ringe'] = {
    baseVals: { rating: 5, gammaadj: 1.5, decay: 0.9, zoom: 1.004, wrap: 0, warp: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0 },
    init_eqs_str: 'a.sn=0;a.sp=0;a.rr=0;a.t1=-99;a.t2=-99;a.t3=-99;a.t4=-99;a.fl=0;a.q1=99;a.q2=99;a.q3=99;a.q4=99;a.q5=0;a.kk=0;',
    frame_eqs_str:
      'a.sn=Math.max(0,(a.mid+a.treb)*.5-1.0);' +
      'if(a.sn>.28&&a.sp<=.28&&a.time-Math.max(a.t1,a.t2,a.t3,a.t4)>.16){a.rr=(a.rr%4)+1;if(a.rr==1)a.t1=a.time;if(a.rr==2)a.t2=a.time;if(a.rr==3)a.t3=a.time;if(a.rr==4)a.t4=a.time;a.fl=Math.min(1,a.sn*2);}' +
      'a.sp=a.sn;a.fl*=.8;' +
      'a.kk=Math.max(a.kk*.85,Math.min(1.5,Math.max(0,a.bass-1.05)));' +
      'a.q1=a.time-a.t1;a.q2=a.time-a.t2;a.q3=a.time-a.t3;a.q4=a.time-a.t4;a.q5=a.fl;' +
      'a.zoom=1.004+.03*a.kk;a.rot=.003*Math.sin(a.time*.5);',
    pixel_eqs_str: 'a.rot=a.rot+.01*a.q5*a.rad;',
    shapes: [ring(1), ring(2), ring(3), ring(4)],
    waves: noWave(4),
    warp: '',
    comp: ` shader_body {
  vec2 d = (uv - 0.5) * q5 * 0.012;
  vec3 c;
  c.r = texture(sampler_main, uv + d).r;
  c.g = texture(sampler_main, uv).g;
  c.b = texture(sampler_main, uv - d).b;
  float l = clamp(dot(c, vec3(0.3, 0.59, 0.11)) * 1.4, 0.0, 1.0);
  vec3 col = mix(vec3(0.0, 0.05, 0.0), vec3(0.8, 1.0, 0.1), l) + vec3(0.5, 0.0, 0.6) * (c.b * 0.5);
  col *= 1.0 + 0.8 * q5;
  ret = col;
 }`
  };

  // ---------- 4) + 5) Bild-Presets aus Emmos Makro-Clips: Standbild, das auf den Ton reagiert ----------
  // Bild kommt als Textur (window.ACID_IMAGES, index.html lädt sie per loadExtraImages).
  // Kick = Zoom-Puls + Aufhellen, 303-Linie = Farbe/Wellenverzerrung, Hats = Farbsäume + Glitzer.
  const imgPreset = (img, tintA, tintB, hueMix) => ({
    baseVals: { rating: 5, gammaadj: 1.3, decay: 0.8, zoom: 1.0, wrap: 0, warp: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0 },
    init_eqs_str: 'a.kk=0;a.ac=0;a.hh=0;a.ph=0;a.tp=0;a.dt=0;a.q1=0;a.q2=0;a.q3=0;a.q4=0;a.q5=0;',
    frame_eqs_str:
      'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;' +
      'a.kk=Math.max(a.kk*.82,Math.min(1.6,Math.max(0,a.bass-1.05)));' +
      'a.ac=a.ac*.88+.12*Math.min(2,Math.max(0,a.mid-.9));' +
      'a.hh=Math.max(a.hh*.75,Math.min(1.5,Math.max(0,a.treb-1.05)));' +
      'a.ph+=a.dt*(.12+.9*a.kk+.4*a.ac);' +
      'a.q1=a.kk;a.q2=a.ph;a.q3=a.ac;a.q5=a.hh;',
    pixel_eqs_str: '',
    shapes: none(4),
    waves: noWave(4),
    warp: '',
    comp: ` uniform sampler2D sampler_${img};
 shader_body {
  vec2 p = uv - 0.5;
  float r = length(p);
  float zm = 1.0 - 0.05 * q1 - 0.02;
  vec2 w = vec2(sin(uv.y * 9.0 + q2 * 2.0), cos(uv.x * 9.0 - q2 * 1.7)) * 0.006 * (0.3 + q3);
  vec2 puv = p * zm + 0.5 + w + vec2(sin(q2 * 0.35), cos(q2 * 0.27)) * 0.012;
  vec2 ab = p * (0.004 + 0.016 * q5);
  vec3 c;
  c.r = texture(sampler_${img}, puv + ab).r;
  c.g = texture(sampler_${img}, puv).g;
  c.b = texture(sampler_${img}, puv - ab).b;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 tint = mix(vec3(${tintA}), vec3(${tintB}), clamp(q3 * ${hueMix}, 0.0, 1.0));
  c = mix(c, c * tint, 0.55 * clamp(q3, 0.0, 1.0));
  c += c * l * 1.6 * q1;
  float sp = step(0.93, fract(sin(dot(floor(uv * 90.0 + floor(time * 14.0)), vec2(12.9898, 78.233))) * 43758.5453));
  c += tint * sp * l * 1.5 * q5;
  float vg = 1.0 - 0.6 * r * r * 1.6;
  c *= (0.85 + 0.55 * q1) * vg;
  ret = c;
 }`
  });
  P['Acid · Gold-Staub'] = imgPreset('acidgold', '1.0, 1.0, 1.0', '1.5, 0.5, 1.4', 0.9);
  P['Acid · Glaskugel'] = imgPreset('acidkugel', '1.0, 1.0, 1.0', '1.5, 0.9, 0.5', 0.9);
  window.ACID_IMAGES = {
    acidgold:  { data: 'acid-bild-gold.jpg',  width: 1280, height: 720 },
    acidkugel: { data: 'acid-bild-kugel.jpg', width: 1280, height: 720 }
  };

  window.ACID_PRESETS = P;
})();
