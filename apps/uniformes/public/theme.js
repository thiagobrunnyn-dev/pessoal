'use strict';

const themeKey = 'uniformes-visual';
const root = document.documentElement;
let visual = 'dark';
try {
  if (localStorage.getItem(themeKey) === 'light') visual = 'light';
} catch {}
root.dataset.visual = visual;

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  const updateLabel = () => {
    toggle.textContent = visual === 'dark' ? 'Visual claro' : 'Visual escuro';
  };
  updateLabel();
  toggle.addEventListener('click', () => {
    visual = visual === 'dark' ? 'light' : 'dark';
    root.dataset.visual = visual;
    updateLabel();
    try {
      localStorage.setItem(themeKey, visual);
    } catch {}
  });
});
