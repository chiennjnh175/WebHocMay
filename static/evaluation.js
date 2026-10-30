import { enhanceGlassDropdowns } from './dropdowns.mjs';
import { loadComparison } from './comparison.mjs';
const tabs = ['test', 'comparison'].map(id => document.getElementById(`${id}-tab`));
function selectTab(index, focus = false) {
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
  if (focus) tabs[index].focus();
  history.replaceState(null, '', index ? '#comparison' : location.pathname);
  if (index) {
    document.querySelectorAll('#test-view video').forEach(video => video.pause());
    loadComparison();
  }
}
tabs.forEach((tab,index) => {
  tab.addEventListener('click', () => selectTab(index));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    selectTab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1-index, true);
  });
});
const dialog = document.getElementById('figure-dialog');
document.getElementById('close-figure').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();
});
enhanceGlassDropdowns(document.querySelectorAll('.panel-heading select'));
if (['#comparison','#evaluation'].includes(location.hash)) selectTab(1);