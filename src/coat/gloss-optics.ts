import { opticalFit, chromaFit } from './dot-optics';

const f = (n: number) => n.toFixed(8);
const tuple = (values: readonly number[]) => 'vec3(' + values.map(f).join(', ') + ')';
const lamp = tuple(opticalFit.slice(0,3)), streak = tuple(opticalFit.slice(3,6));
function panel(longitude: number, latitude: number) {
  return tuple([Math.cos(longitude)*Math.cos(latitude), Math.sin(longitude)*Math.cos(latitude), Math.sin(latitude)]);
}
const right = panel(opticalFit[8], opticalFit[9]), left = panel(opticalFit[10], opticalFit[11]);

/** A positional studio-light fit. A normal on a wide cheek and the same normal on a
 * narrow nose see different distances to the lamp and reflector panels. */
export const glossOptics = `
uniform vec3 glossCoefficients[14], glossPigment;
uniform vec3 pigmentControls;

vec3 toDisplay(vec3 linearRGB) {
  vec3 v = max(vec3(0.), linearRGB);
  return mix(12.92*v, 1.055*pow(v,vec3(1./2.4))-.055, step(vec3(.0031308),v));
}
vec3 fromDisplay(vec3 value) {
  return mix(value/12.92, pow(max(vec3(0.), (value+.055)/1.055),vec3(2.4)), step(vec3(.04045),value));
}
float panelResponse(vec3 vector, float radius, vec3 normal) {
  float distance2 = dot(vector,vector);
  return max(0., dot(normal,vector)*inversesqrt(distance2)+${f(opticalFit[16])}) /
    (${f(opticalFit[17])}*radius*radius + distance2);
}
vec3 measuredGloss(vec3 normal, vec3 position) {
  vec3 ray = ${lamp} - position;
  float distance2 = dot(ray,ray);
  vec3 lightDirection = ray*inversesqrt(distance2);
  vec3 reflection = 2.*normal.z*normal - vec3(0.,0.,1.);
  float lambert = max(dot(normal,lightDirection),0.);
  float angle = dot(reflection,lightDirection)-1.;
  float stripe = dot(reflection,${streak});
  float specular = exp(18.*angle - stripe*stripe);
  float grazing = 1.-normal.z;
  vec3 linearRGB = glossCoefficients[0] + glossCoefficients[1]*normal.x +
    glossCoefficients[2]*normal.y + glossCoefficients[3]*normal.z +
    glossCoefficients[4]*lambert*lambert + glossCoefficients[5]*grazing*grazing +
    glossCoefficients[6]*exp(${f(opticalFit[6])}*angle - stripe*stripe) +
    glossCoefficients[7]*exp(${f(opticalFit[7])}*angle) +
    glossCoefficients[8]*exp(${f(opticalFit[12])}*(dot(reflection,${right})-1.)) +
    glossCoefficients[9]*exp(${f(opticalFit[13])}*(dot(reflection,${left})-1.)) +
    glossCoefficients[10]*panelResponse(${right}*${f(opticalFit[14])}-position,${f(opticalFit[14])},normal) +
    glossCoefficients[11]*panelResponse(${left}*${f(opticalFit[15])}-position,${f(opticalFit[15])},normal) +
    glossCoefficients[12]*((lambert+${f(opticalFit[18])})/(${f(opticalFit[19])}+distance2)) + glossCoefficients[13]*specular;
  float shine = specular*${f(chromaFit[0])};
  vec3 swatch = toDisplay(max(vec3(0.), linearRGB - shine));
  float peak = max(swatch.r,max(swatch.g,swatch.b));
  if (pigmentControls.x > .5) {
    float saturation = 1.-min(swatch.r,min(swatch.g,swatch.b))/max(.0001,peak);
    float pigmentPeak = max(glossPigment.r,max(glossPigment.g,glossPigment.b));
    peak *= 1.-pigmentControls.y*saturation*(1.-pigmentPeak);
    swatch = peak*mix(vec3(1.),glossPigment/max(.0001,pigmentPeak),saturation);
  }
  float chroma = pigmentControls.z*${f(chromaFit[1])}*(1.-${f(chromaFit[2])}*exp(angle*${f(chromaFit[3])}));
  return toDisplay(fromDisplay(max(vec3(0.), swatch+(swatch-peak)*chroma)) + shine);
}`;
