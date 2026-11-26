/** Convert a cyan radiance sample into the selected dye before applying contact shadows. */
export const fibreDyeShader = `
uniform vec3 fibreDye[22];
vec3 dyedFibre(vec3 rgb) {
  float r=rgb.r, g=rgb.g, b=rgb.b;
  vec3 change = fibreDye[0] + r*fibreDye[1] + g*fibreDye[2] + b*fibreDye[3]
    + r*g*fibreDye[4] + g*b*fibreDye[5] + b*r*fibreDye[6]
    + r*r*fibreDye[7] + g*g*fibreDye[8] + b*b*fibreDye[9]
    + g*g*g*fibreDye[10] + r*g*g*fibreDye[11] + b*g*g*fibreDye[12]
    + g*r*r*fibreDye[13] + g*b*b*fibreDye[14] + r*g*b*fibreDye[15];
  change += max(0.,g-.42)*fibreDye[16] + max(0.,g-.55)*fibreDye[17]
    + max(0.,g-.64)*fibreDye[18] + max(0.,g-.72)*fibreDye[19]
    + max(0.,g-.80)*fibreDye[20] + max(0.,g-.88)*fibreDye[21];
  return clamp(rgb+change,0.,1.);
}`;
