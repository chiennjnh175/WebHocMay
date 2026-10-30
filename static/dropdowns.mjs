// Progressive enhancement: native selects retain values and change events.
export function enhanceGlassDropdowns(selects) {
  let current = null;
  for (const select of selects) {
    if (select.dataset.glassDropdown) continue;
    select.dataset.glassDropdown = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-dropdown';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'glass-dropdown-trigger liquidglass';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.id);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = document.createElement('div');
    label.className = 'glass-dropdown-label';
    const arrow = document.createElement('div');
    arrow.className = 'glass-dropdown-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    trigger.append(label, arrow);
    const menu = document.createElement('div');
    menu.className = 'glass-dropdown-menu liquidglass';
    menu.id = `${select.id}-listbox`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.hidden = true;
    const popoverSupported = typeof menu.showPopover === 'function';
    if (popoverSupported) menu.setAttribute('popover', 'manual');
    trigger.setAttribute('aria-controls', menu.id);
    select.before(wrapper);
    wrapper.append(select, trigger);
    document.body.append(menu);
    select.hidden = true;
    let opened = false;
    let active = select.selectedIndex;
    let search = '', searchTime = 0;
    const options = () => Array.from(select.options);

    function refresh() {
      label.textContent = select.selectedOptions[0]?.textContent || '';
      trigger.disabled = select.disabled;
      menu.replaceChildren();
      options().forEach((option, index) => {
        const item = document.createElement('div');
        item.id = `${menu.id}-${index}`;
        item.className = 'glass-dropdown-option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.setAttribute('aria-disabled', String(option.disabled));
        const text = document.createElement('div');
        text.textContent = option.textContent;
        const check = document.createElement('div');
        check.className = 'glass-dropdown-check';
        check.textContent = option.selected ? '✓' : '';
        check.setAttribute('aria-hidden', 'true');
        item.append(text, check);
        item.addEventListener('pointermove', () => { if (!option.disabled) highlight(index, false); });
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('click', () => { if (!option.disabled) commit(index); });
        menu.append(item);
      });
    }

    function highlight(index, scroll = true) {
      active = index;
      Array.from(menu.children).forEach((item, i) => item.classList.toggle('is-active', i === active));
      const item = menu.children[active];
      if (item) {
        trigger.setAttribute('aria-activedescendant', item.id);
        if (scroll) item.scrollIntoView({ block: 'nearest' });
      }
    }

    function position() {
      if (!opened) return;
      const rect = trigger.getBoundingClientRect();
      if (!trigger.getClientRects().length || rect.bottom < 0 || rect.top > innerHeight) { close(); return; }
      const width = Math.min(Math.max(rect.width, 210), innerWidth - 24);
      const below = innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const useAbove = below < 180 && above > below;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${Math.min(300, Math.max(80, (useAbove ? above : below) - 8))}px`;
      const height = menu.getBoundingClientRect().height;
      menu.style.left = `${Math.max(12, Math.min(rect.right - width, innerWidth - width - 12))}px`;
      menu.style.top = `${useAbove ? rect.top - height - 8 : rect.bottom + 8}px`;
    }

    function open() {
      if (select.disabled || opened) return;
      if (current) current();
      refresh();
      opened = true;
      current = close;
      trigger.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      if (popoverSupported) menu.showPopover();
      position();
      highlight(select.selectedIndex);
    }

    function close(focus = false) {
      if (!opened) return;
      opened = false;
      if (current === close) current = null;
      if (popoverSupported) menu.hidePopover();
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      if (focus) trigger.focus({ preventScroll: true });
    }

    function commit(index) {
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      refresh();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      close(true);
    }

    function step(direction) {
      const enabled = options().map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
      if (!enabled.length) return;
      const index = enabled.indexOf(active);
      highlight(enabled[(index + direction + enabled.length) % enabled.length]);
    }

    trigger.addEventListener('click', () => { if (opened) close(); else open(); });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Escape') { if (opened) { event.preventDefault(); close(true); } return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        if (!opened) { open(); return; }
        if (event.key === 'Enter' || event.key === ' ') { commit(active); return; }
        if (event.key === 'Home' || event.key === 'End') {
          const enabled = options().map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
          if (enabled.length) highlight(event.key === 'Home' ? enabled[0] : enabled.at(-1));
        } else step(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (performance.now() - searchTime > 700) search = '';
        search += event.key.toLocaleLowerCase();
        searchTime = performance.now();
        if (!opened) open();
        const index = options().findIndex(option => !option.disabled && option.textContent.trim().toLocaleLowerCase().startsWith(search));
        if (index >= 0) highlight(index);
      }
    });
    select.addEventListener('change', refresh);
    document.addEventListener('pointerdown', event => { if (opened && !wrapper.contains(event.target) && !menu.contains(event.target)) close(); });
    document.addEventListener('focusin', event => { if (opened && !wrapper.contains(event.target) && !menu.contains(event.target)) close(); });
    document.addEventListener('scroll', event => { if (event.target !== menu) position(); }, true);
    window.addEventListener('resize', position);
    refresh();
  }
}
