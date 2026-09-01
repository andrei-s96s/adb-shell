// Отдельный классический (не module) скрипт, загружается первым, до
// renderer.js — CSP этой страницы блокирует инлайн-скрипты, поэтому
// обработчик ошибок не может быть <script> внутри index.html.
window.addEventListener('error', (event) => {
  const el = document.createElement('pre');
  el.style.color = 'red';
  el.style.padding = '16px';
  el.textContent = 'Ошибка загрузки: ' + (event.error ? event.error.stack || event.error.message : event.message);
  document.body.prepend(el);
});
