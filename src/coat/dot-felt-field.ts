/** Decode the two optical surfaces. Intensity keeps the full spatial grid. The three
 * directional derivatives change more slowly and use bilinear reconstruction. */
export function feltField(field: string, size: number): Uint8Array {
  const bytes = atob(field);
  const optical = new Uint8Array(8*size*size);
  let cursor = 0;
  const word = () => bytes.charCodeAt(cursor++) | (bytes.charCodeAt(cursor++) << 8);
  for (let side = 0; side < 2; side++) for (let channel = 0; channel < 4; channel++) {
    const width = channel ? size/2 : size;
    const plane = new Uint8Array(width*width).fill(128);
    for (let row = 0; row < width; row++) {
      const start = word(), count = word();
      if (!count) continue;
      const order = bytes.charCodeAt(cursor++);
      let buffer = 0, pending = 0;
      function bits(n: number) {
        while (pending < n) {
          buffer |= bytes.charCodeAt(cursor++) << pending;
          pending += 8;
        }
        const value = buffer & ((1 << n)-1);
        buffer >>>= n; pending -= n;
        return value;
      }
      for (let x = start; x < start+count; x++) {
        let prefix = 0;
        while (prefix < 15 && bits(1)) prefix++;
        const residual = prefix === 15 ? bits(9) : (prefix << order) | bits(order);
        const i = row*width+x;
        const left = x ? plane[i-1] : 128, up = row ? plane[i-width] : 128;
        const diagonal = x && row ? plane[i-width-1] : 128;
        const predicted = Math.max(Math.min(left,up),Math.min(Math.max(left,up),left+up-diagonal));
        plane[i] = predicted + ((residual >>> 1) ^ -(residual & 1));
      }
    }
    const offset = side*size*size*4+channel;
    if (!channel) {
      for (let i=0; i<plane.length; i++) optical[offset+4*i] = plane[i];
      continue;
    }
    for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
      const u = Math.max(0,Math.min(width-1,(x-.5)/2)), v = Math.max(0,Math.min(width-1,(y-.5)/2));
      const l = Math.floor(u), t = Math.floor(v), r = Math.min(l+1,width-1), b = Math.min(t+1,width-1);
      const dx = u-l, dy = v-t;
      const upper = plane[t*width+l]*(1-dx)+plane[t*width+r]*dx;
      const lower = plane[b*width+l]*(1-dx)+plane[b*width+r]*dx;
      optical[offset+4*(y*size+x)] = Math.round(upper*(1-dy)+lower*dy);
    }
  }
  if (cursor !== bytes.length) throw new Error('Dot optical field has a different size');
  return optical;
}
