/* global chrome */

const statusEl = document.getElementById('status');
const queueEl = document.getElementById('queue');
const startButton = document.getElementById('start');
const clearButton = document.getElementById('clear');
const refreshButton = document.getElementById('refresh');

const updateUi = (state) => {
  statusEl.textContent = state?.isRunning ? 'Running' : 'Idle';
  queueEl.textContent = `${state?.queueSize || 0} job${state?.queueSize === 1 ? '' : 's'}`;
};

const sendMessage = (type) => (
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      if (response?.success === false) {
        reject(new Error(response.error || 'Extension request failed'));
        return;
      }

      resolve(response);
    });
  })
);

const refreshState = async () => {
  const state = await sendMessage('GET_STATE');
  updateUi(state);
};

startButton.addEventListener('click', async () => {
  try {
    const state = await sendMessage('START_RUN');
    updateUi(state);
  } catch (error) {
    statusEl.textContent = error.message || 'Unable to start';
  }
});

clearButton.addEventListener('click', async () => {
  try {
    const state = await sendMessage('CLEAR_QUEUE');
    updateUi(state);
  } catch (error) {
    statusEl.textContent = error.message || 'Unable to clear';
  }
});

refreshButton.addEventListener('click', refreshState);

refreshState();
