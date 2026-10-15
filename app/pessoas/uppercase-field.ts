'use client';
import type {SyntheticEvent} from 'react';
import {uppercasePersonText} from '../../lib/person-text';

type Control = HTMLInputElement | HTMLTextAreaElement;
export function updateUppercaseField(raw: string, onValue: (value: string) => void, element?: Control | null, composing = false) {
  if (composing) {onValue(raw); return;}
  const value = uppercasePersonText(raw);
  const start = element?.selectionStart, end = element?.selectionEnd;
  const selection = start == null || end == null ? null : {
    start: uppercasePersonText(raw.slice(0, start)).length,
    end: uppercasePersonText(raw.slice(0, end)).length,
  };
  onValue(value);
  if (element && selection && raw !== value) {
    window.requestAnimationFrame(() => {
      if (element.isConnected && document.activeElement === element && element.value === value) element.setSelectionRange(selection.start, selection.end);
    });
  }
}
export function uppercaseFieldEvent(event: SyntheticEvent<Control>, onValue: (value: string) => void) {
  updateUppercaseField(event.currentTarget.value, onValue, event.currentTarget, !!(event.nativeEvent as InputEvent).isComposing);
}
