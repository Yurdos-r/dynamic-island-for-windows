function createFrameInteractionController(options = {}) {
  const state = options.state;
  const mainHoverController = options.mainHoverController;
  const updateMousePassthrough = options.updateMousePassthrough || (() => {});
  const updateSystemMousePassthrough = options.updateSystemMousePassthrough || (() => {});

  if (!state) {
    throw new Error("state is required to create frame interaction controller.");
  }

  function assertMainFrameSender(event) {
    return Boolean(state.mainWindow && !state.mainWindow.isDestroyed() && event.sender === state.mainWindow.webContents);
  }

  function assertSystemFrameSender(event) {
    return Boolean(state.systemWindow && !state.systemWindow.isDestroyed() && event.sender === state.systemWindow.webContents);
  }

  function setMainInteracting(interacting) {
    state.rendererInteracting = Boolean(interacting);
    if (state.rendererInteracting) {
      mainHoverController?.clearTimers();
    }
    updateMousePassthrough(true);
    return state.rendererInteracting;
  }

  function setSystemInteracting(interacting) {
    state.systemRendererInteracting = Boolean(interacting);
    updateSystemMousePassthrough(true);
    return state.systemRendererInteracting;
  }

  return {
    assertMainFrameSender,
    assertSystemFrameSender,
    setMainInteracting,
    setSystemInteracting
  };
}

module.exports = {
  createFrameInteractionController
};
