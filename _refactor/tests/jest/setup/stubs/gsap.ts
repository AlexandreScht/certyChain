/**
 * Stub Jest de `gsap` — les timelines/ScrollTrigger ne sont pas le sujet des
 * specs composants (et jsdom n'a pas de layout). No-op sûr, chaînable.
 */
const noop = (): undefined => undefined;

const timeline = () => ({
  from: timelineSelf,
  to: timelineSelf,
  fromTo: timelineSelf,
  set: timelineSelf,
  add: timelineSelf,
  kill: noop,
  pause: timelineSelf,
  play: timelineSelf,
});
function timelineSelf(): ReturnType<typeof timeline> {
  return timeline();
}

const gsap = {
  registerPlugin: noop,
  from: noop,
  to: noop,
  fromTo: noop,
  set: noop,
  killTweensOf: noop,
  timeline,
  context: () => ({ revert: noop, add: noop, kill: noop }),
  matchMedia: () => ({ add: noop, revert: noop, kill: noop }),
};

export default gsap;
export { gsap };
