// Порт IntentTesterSheet из Sources/AdbShell/Views/IntentTesterSheet.swift.

import { adbApi, errorMessage } from '../api.js';
import type { IntentPreset } from '../api.js';
import { openModal } from '../modal.js';

export function openIntentTesterModal(serial: string): void {
  openModal('Intent / Deep Link', (body) => {
    const uriRow = document.createElement('div');
    uriRow.className = 'connect-row';
    const uriInput = document.createElement('input');
    uriInput.placeholder = 'myapp://path или https://…';
    uriRow.appendChild(uriInput);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Отправить';
    uriRow.appendChild(sendBtn);
    body.appendChild(uriRow);

    const resultEl = document.createElement('div');
    resultEl.className = 'hint';
    body.appendChild(resultEl);

    const send = (): void => {
      const uri = uriInput.value.trim();
      if (!uri) return;
      resultEl.className = 'hint';
      resultEl.textContent = 'Отправка…';
      adbApi
        .openDeepLink(serial, uri)
        .then((output) => {
          resultEl.className = 'hint';
          resultEl.textContent = output.length > 0 ? output : 'Готово';
        })
        .catch((error) => {
          resultEl.className = 'error';
          resultEl.textContent = errorMessage(error);
        });
    };
    sendBtn.addEventListener('click', send);
    uriInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') send();
    });

    const saveRow = document.createElement('div');
    saveRow.className = 'connect-row';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Имя пресета (необязательно)';
    saveRow.appendChild(nameInput);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Сохранить пресет';
    saveRow.appendChild(saveBtn);
    body.appendChild(saveRow);

    const presetsTitle = document.createElement('div');
    presetsTitle.className = 'hint section-title';
    presetsTitle.textContent = 'Пресеты';
    body.appendChild(presetsTitle);

    const presetsListEl = document.createElement('ul');
    presetsListEl.className = 'scroll-list small';
    body.appendChild(presetsListEl);

    let presets: IntentPreset[] = [];

    const renderPresets = (): void => {
      presetsListEl.innerHTML = '';
      for (const preset of presets) {
        const li = document.createElement('li');
        li.className = 'row';
        const label = document.createElement('span');
        label.textContent = preset.name;
        label.title = preset.uri;
        li.appendChild(label);

        const sendPresetBtn = document.createElement('button');
        sendPresetBtn.type = 'button';
        sendPresetBtn.textContent = 'Send';
        sendPresetBtn.addEventListener('click', () => {
          uriInput.value = preset.uri;
          send();
        });
        li.appendChild(sendPresetBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
          adbApi
            .intentPresetsRemove(preset.id)
            .then((updated) => {
              presets = updated;
              renderPresets();
            })
            .catch((error) => (resultEl.textContent = errorMessage(error)));
        });
        li.appendChild(removeBtn);

        presetsListEl.appendChild(li);
      }
    };

    saveBtn.addEventListener('click', () => {
      const uri = uriInput.value.trim();
      if (!uri) return;
      adbApi
        .intentPresetsAdd(nameInput.value, uri)
        .then((updated) => {
          presets = updated;
          nameInput.value = '';
          renderPresets();
        })
        .catch((error) => (resultEl.textContent = errorMessage(error)));
    });

    adbApi
      .intentPresetsList()
      .then((list) => {
        presets = list;
        renderPresets();
      })
      .catch(() => {});
  });
}
