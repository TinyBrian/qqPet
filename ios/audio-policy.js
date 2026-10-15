// The native host applies this policy before Ruffle in every frame.
window.__qqpetRespectSystemAudio = true;

// iOS 15 defers the WebAudio session category update. Starting output first
// activates SoloAmbient and interrupts other audio before Ambient is selected.
// Pause synchronously, then allow that update to run before the first resume.
// This ordering relies on iOS 15 AudioContext's script-suspended startup path.
if (window.__qqpetDeferAudioStart === true) {
  const Native = window.AudioContext || window.webkitAudioContext;
  if (Native) {
    const DeferredAudioContext = new Proxy(Native, {
      construct(target, args, newTarget) {
        const context = Reflect.construct(target, args, newTarget);
        const resume = context.resume.bind(context);
        const suspend = context.suspend.bind(context);
        const suspended = suspend();
        let suspension = 0;
        const ready = Promise.resolve(suspended).catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 200)));
        context.suspend = () => { suspension++; return suspend(); };
        context.resume = () => {
          const expected = suspension;
          // A later pause must still win while startup is waiting.
          return ready.then(() => expected === suspension ? resume() : undefined);
        };
        return context;
      },
    });
    if (window.AudioContext) window.AudioContext = DeferredAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = DeferredAudioContext;
  }
}
