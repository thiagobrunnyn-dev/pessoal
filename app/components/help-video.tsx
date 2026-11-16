'use client';
import {useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import {CirclePlay, X} from 'lucide-react';
import {HELP_VIDEOS, helpVideoFor, helpVideoLength} from '../../lib/help-videos';

/**
 * "Ver como funciona": header button that opens the short help video of the current screen.
 *
 * The window is only in the page while open, so no video file is requested before the click.
 * The other videos are listed under the player and play in the same window.
 */
export default function HelpVideoButton() {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const video = openId ? HELP_VIDEOS.find(item => item.id === openId) || null : null;

  useEffect(() => {
    if (video && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [video]);

  function close() {
    dialog.current?.close();
    setOpenId(null);
    trigger.current?.focus();
  }

  return (
    <>
      <button ref={trigger} type="button" className="help-video-button" onClick={() => setOpenId(helpVideoFor(pathname).id)} aria-haspopup="dialog" title="Ver um vídeo curto sobre esta tela">
        <CirclePlay size={18} aria-hidden="true"/>
        <span className="help-video-label">Ver como funciona</span>
      </button>
      {video && (
        <dialog
          ref={dialog}
          className="help-video-dialog no-print"
          aria-labelledby="help-video-title"
          onCancel={event => { event.preventDefault(); close(); }}
          onClick={event => { if (event.target === dialog.current) close(); }}
        >
          <header className="help-video-head">
            <div>
              <small>Ver como funciona</small>
              <h2 id="help-video-title">{video.title}</h2>
            </div>
            <button type="button" className="help-video-close" onClick={close} aria-label="Fechar o vídeo"><X size={20} aria-hidden="true"/></button>
          </header>
          {/* The key restarts the player when another video is chosen. */}
          <video key={video.id} src={video.file} controls autoPlay playsInline preload="metadata" aria-label={'Vídeo: ' + video.title}/>
          <p className="help-video-about">{video.summary} <span>Demonstração com dados fictícios.</span></p>
          <ul className="help-video-list" aria-label="Vídeos disponíveis">
            {HELP_VIDEOS.map(item => (
              <li key={item.id}>
                <button type="button" aria-current={item.id === video.id ? 'true' : undefined} onClick={() => setOpenId(item.id)}>
                  <span>{item.title}</span>
                  <small>{helpVideoLength(item.seconds)}</small>
                </button>
              </li>
            ))}
          </ul>
        </dialog>
      )}
    </>
  );
}
