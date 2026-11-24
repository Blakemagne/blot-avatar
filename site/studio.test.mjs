// The studio's plain parts: reading a model's reply, share links, prompts, agent links and the still to download.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

const S = await import('./studio.ts');
const { GALLERY, galleryAvatar } = await import('../src/index.ts');

const cat = galleryAvatar('cat').definition;
const ACTIVITIES = ['idle', 'thinking', 'working', 'waiting', 'speaking', 'sleeping'];

test('a reply is read in a code fence, in words round it, or bare; a list adds each', () => {
  const one = JSON.stringify(cat);
  for (const text of [one, `\`\`\`json\n${one}\n\`\`\``, `Here you go:\n${one}\nEnjoy!`, `${one}\nWant changes?`]) {
    const r = S.parseImport(text);
    assert.ok(r.ok, text);
    assert.deepEqual(r.values, [cat]);
  }
  assert.deepEqual(S.parseImport(`Here:\n\`\`\`\n${one}\n\`\`\``).notes, ['Read the JSON inside the code fence.']);
  assert.deepEqual(S.parseImport(`\`\`\`\n${one}\n\`\`\``).notes, [], 'nothing to say when the fence is all there is');
  const two = S.parseImport(JSON.stringify([cat, galleryAvatar('egg').definition]));
  assert.ok(two.ok && two.values.length === 2);
  const twice = S.parseImport(JSON.stringify([{ ...cat, name: 'A' }, { ...cat, name: 'B' }]));
  assert.ok(twice.ok);
  assert.deepEqual(twice.values.map((d) => d.name), ['B'], 'one per id, the later one');
});

test('a name that would end a line in code is refused', () => {
  for (const name of ['a\u2028b', 'a\u2029b', 'a\u0085b', 'a<b']) assert.equal(S.parseImport(JSON.stringify({ ...cat, name })).ok, false, JSON.stringify(name));
});

test('a definition from a link that has one of yours\' ids goes under another, and the same one is not added twice', () => {
  const mine = { ...cat, name: 'Mine' };
  assert.equal(S.freeId([], cat), cat);
  assert.equal(S.freeId([cat], cat), cat, 'the same definition keeps its id');
  assert.equal(S.freeId([mine], cat).id, 'cat-2');
  assert.equal(S.freeId([mine, { ...cat, id: 'cat-2', name: 'Other' }], cat).id, 'cat-3');
  assert.equal(S.freeId([mine, { ...cat, id: 'cat-2' }], cat).id, 'cat-2', 'already there under cat-2');
  const long = { ...cat, id: 'a'.repeat(39) + 'b' };
  const moved = S.freeId([{ ...long, name: 'x' }], long);
  assert.ok(moved.id.length <= 40 && S.parseImport(JSON.stringify(moved)).ok, moved.id);
});

test('brackets in the words round the JSON, two code fences, a cut-off reply and a stray comma are each read right', () => {
  const one = JSON.stringify(cat), egg = JSON.stringify(galleryAvatar('egg').definition);
  for (const text of [`${one}
Want the eyes {bigger}?`, `Here (a [teapot]):
${one}`, `﻿${one}`]) {
    const r = S.parseImport(text);
    assert.ok(r.ok && r.values[0].id === 'cat', text);
  }
  const fences = S.parseImport(`\`\`\`json
${one}
\`\`\`
and
\`\`\`json
${egg}
\`\`\``);
  assert.ok(fences.ok);
  assert.deepEqual(fences.values.map((d) => d.id), ['cat', 'egg']);
  // Cut off, the reply is said to be cut off, and the repair prompt gets all of it, not the body inside it.
  const cut = S.parseImport(`Sure: ${one.slice(0, -30)}`);
  assert.ok(!cut.ok && cut.hints.some((h) => h.includes('cut off')) && cut.source.startsWith('{"version":1'));
  const comma = S.parseImport(one.replace(/}}$/, '},}'));
  assert.ok(!comma.ok && comma.hints.some((h) => h.includes('comma')) && comma.source.startsWith('{"version":1'));
});

test('a reply that is not an avatar says why, with hints, and keeps the text for a repair prompt', () => {
  const empty = S.parseImport('  ');
  assert.equal(empty.ok, false);
  assert.equal(empty.source, '');
  const comma = S.parseImport('{"version":1,}');
  assert.ok(!comma.ok && comma.errors[0].startsWith('That is not JSON') && comma.hints.some((h) => h.includes('comma')));
  const bad = S.parseImport(JSON.stringify([cat, { ...cat, id: 'Bad Id' }]));
  assert.ok(!bad.ok && bad.errors.some((e) => e.startsWith('Item 2: id must be')), JSON.stringify(bad));
  assert.equal(bad.source, JSON.stringify([cat, { ...cat, id: 'Bad Id' }]));
  assert.equal(S.parseImport('[]').ok, false);
});

test('definitions kept in a browser are checked again, and any that no longer pass are dropped', () => {
  assert.deepEqual(S.reviveYours([cat, { nope: 1 }, 'x']), [cat]);
  assert.deepEqual(S.reviveYours([{ ...cat, name: 'A' }, cat]), [cat], 'one per id');
  assert.deepEqual(S.reviveYours({}), []);
});

test('a share link names a body or a gallery avatar by id and carries one of yours whole', () => {
  const base = 'https://example.test/blot-avatar/';
  assert.equal(S.shareLink(base, { id: 'heart', kind: 'body' }, '#FD690F', '#FD690F', 'idle'), `${base}?avatar=heart`);
  assert.equal(S.shareLink(base, { id: 'cat', kind: 'gallery', definition: cat }, '#1E86FC', '#F59312', 'working'), `${base}?gallery=cat&color=blue&doing=working`);
  assert.equal(S.shareLink(base, { id: 'cat', kind: 'gallery', definition: cat }, '#123abc', '#F59312', 'idle'), `${base}?gallery=cat&color=123ABC`);
  // The gallery's cloud is not the body called cloud.
  assert.deepEqual(S.readShare(new URL(S.shareLink(base, { id: 'cloud', kind: 'gallery' }, '#13B7A2', '#13B7A2', 'idle')).search, ACTIVITIES), { gallery: 'cloud' });
  const mine = { ...cat, id: 'my-cat', name: 'Mine ✓' };
  const link = S.shareLink(base, { id: mine.id, kind: 'yours', definition: mine }, '#FD690F', '#FD690F', 'idle');
  const read = S.readShare(new URL(link).search, ACTIVITIES);
  assert.deepEqual(read.definition, mine, 'a name outside ASCII comes back the same');
  assert.equal(read.avatar, undefined);
});

test('a link\'s query is read with care: anything wrong is left out, and a bad definition says why', () => {
  assert.deepEqual(S.readShare('?avatar=cat&color=Blue&doing=THINKING', ACTIVITIES), { avatar: 'cat', colour: '#1E86FC', doing: 'thinking' });
  assert.deepEqual(S.readShare('?color=abc&doing=dancing', ACTIVITIES), { colour: '#AABBCC' });
  assert.deepEqual(S.readShare('?color=red;x', ACTIVITIES), {});
  assert.match(S.readShare('?def=%%%', ACTIVITIES).problem, /neither base64url nor JSON/);
  assert.match(S.readShare(`?def=${encodeURIComponent(JSON.stringify({ ...cat, version: 2 }))}`, ACTIVITIES).problem, /version must be 1/);
  assert.deepEqual(S.readShare(`?def=${encodeURIComponent(JSON.stringify(cat))}`, ACTIVITIES).definition, cat, 'JSON as it is works too');
});

test('a prompt carries the description; its short form points at the hosted prompt instead of carrying it', () => {
  const b = S.designBrief('# The prompt', 'https://example.test/prompt.md', '  a teapot \n');
  assert.ok(b.full.startsWith('# The prompt\n\n---\n') && b.full.includes('\na teapot\n'));
  assert.ok(b.linked.includes('https://example.test/prompt.md') && !b.linked.includes('# The prompt') && b.linked.includes('\na teapot\n'));
  const r = S.repairBrief('# P', 'u', '{"x":1}', ['one', 'two']);
  assert.ok(r.full.includes('- one\n- two') && r.full.includes('{"x":1}'));
});

test('an agent link fills the prompt in, every character encoded, + as %2B', () => {
  assert.equal(S.AGENTS.claude.link('a+b c&d'), 'claude://code/new?q=a%2Bb%20c%26d');
  assert.equal(S.AGENTS.cursor.link('x'), 'cursor://anysphere.cursor-deeplink/prompt?text=x');
  assert.ok(S.isAgent('codex') && !S.isAgent('toString') && !S.isAgent(null));
});

test('the still to download is an SVG of the body and both eyes, for a body and a definition alike', () => {
  for (const shape of ['heart', GALLERY[0].definition]) {
    const svg = S.stillSvg(shape, '#FD690F', 128);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="128" height="128" viewBox="[-\d. ]+">/);
    assert.equal((svg.match(/<path /g) ?? []).length >= 3, true);
    assert.ok(svg.includes('fill="#FD690F"') && svg.includes('fill="#FFFFFF"'));
  }
});

test('a share link carries a fluffy finish and leaves a flat one out, and the finish comes back from it', () => {
  const base = 'https://example.test/blot-avatar/';
  assert.equal(S.shareLink(base, { id: 'heart', kind: 'body' }, '#FD690F', '#FD690F', 'idle', 'flat'), `${base}?avatar=heart`);
  assert.equal(S.shareLink(base, { id: 'heart', kind: 'body' }, '#FD690F', '#FD690F', 'idle'), `${base}?avatar=heart`, 'flat is the default');
  const fluffy = S.shareLink(base, { id: 'cat', kind: 'gallery', definition: cat }, '#1E86FC', '#F59312', 'working', 'fluffy');
  assert.equal(fluffy, `${base}?gallery=cat&color=blue&doing=working&material=fluffy`);
  assert.deepEqual(S.readShare(new URL(fluffy).search, ACTIVITIES), { gallery: 'cat', colour: '#1E86FC', doing: 'working', material: 'fluffy' });
  const mine = { ...cat, id: 'my-cat' };
  const read = S.readShare(new URL(S.shareLink(base, { id: mine.id, kind: 'yours', definition: mine }, '#FD690F', '#FD690F', 'idle', 'fluffy')).search, ACTIVITIES);
  assert.equal(read.material, 'fluffy');
  assert.deepEqual(read.definition, mine);
  // Without one the visitor's own finish stays; a hand-written one is read with care.
  assert.equal(S.readShare('?avatar=heart', ACTIVITIES).material, undefined);
  assert.equal(S.readShare('?avatar=heart&material=Fluffy', ACTIVITIES).material, 'fluffy');
  assert.equal(S.readShare('?avatar=heart&material=flat', ACTIVITIES).material, 'flat');
  assert.equal(S.readShare('?avatar=heart&material=furry', ACTIVITIES).material, undefined);
  assert.equal(S.readMaterial(null), undefined);
});
