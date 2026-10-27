// 1. ИНИЦИАЛИЗАЦИЯ
const audioPlayer = document.getElementById('audio-player');
const trackListEl = document.getElementById('track-list');
const pageTitle = document.getElementById('page-title');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const navHome = document.getElementById('nav-home');
const navSearch = document.getElementById('nav-search');
const navLibrary = document.getElementById('nav-library');
const navWave = document.getElementById('nav-wave');
const navProfile = document.getElementById('nav-profile');
const profileStats = document.getElementById('profile-stats');
const adminWidget = document.getElementById('admin-widget');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authContainer = document.getElementById('auth-container');

const importBtn = document.getElementById('import-btn');
const importModal = document.getElementById('import-modal');
const btnCloseImport = document.getElementById('btn-close-import');
const importUrlInput = document.getElementById('import-url');
const importTextInput = document.getElementById('import-text');
const btnDoImport = document.getElementById('btn-do-import');
const importStatus = document.getElementById('import-status');

let currentTracks = [];
let currentTrackIndex = -1;
let isPlaying = false;
let isLoginMode = true;
let currentTrackRealDuration = 0;
let lastSearchQuery = '';
let userLikedTrackIds = new Set();
let userSavedAlbumIds = new Set();
let adminInterval = null;
let hiddenPreloader = null;
let isPoppingState = false;

// Web Audio API
let audioContext = null;
let sourceNode = null;
let gainNode = null;

// Удаляем старый Service Worker и кэш
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) registration.unregister();
  });
  if (window.caches) {
    caches.keys().then(function(names) {
      for (let name of names) caches.delete(name);
    });
  }
}

// 2. УТИЛИТЫ
const escapeHTML = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const getValidCover = (url) => url || '/img/default-cover.png';

function getAbsoluteCover(url) {
  const u = getValidCover(url);
  if (u.startsWith('http')) return u;
  return window.location.origin + u;
}

function shuffleArray(array) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function getStreamUrl(track) {
  if (track.stream_url) return track.stream_url;
  if (track.is_external && track.file_url) return track.file_url;
  return `/api/tracks/${track.id}/stream`;
}

function initAudioContext() {
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioContext.createMediaElementSource(audioPlayer);
    gainNode = audioContext.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
  } catch (e) {
    console.error('Web Audio API не поддерживается:', e);
  }
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function loadUserLikes() {
  try {
    const resTracks = await fetch('/api/library');
    if (resTracks.ok) {
      const data = await resTracks.json();
      if (data.tracks) {
        userLikedTrackIds = new Set(data.tracks.map(t => String(t.track_id || t.id)));
      }
    }
    const resAlbums = await fetch('/api/library/albums');
    if (resAlbums.ok) {
      const data = await resAlbums.json();
      if (data.albums) {
        userSavedAlbumIds = new Set(data.albums.map(a => String(a.album_id)));
      }
    }
  } catch (err) {}
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const data = await res.json();

    const onlineEl = document.getElementById('admin-online');
    const totalEl = document.getElementById('admin-total');
    const playsEl = document.getElementById('admin-plays');
    if (onlineEl) onlineEl.textContent = data.online;
    if (totalEl) totalEl.textContent = data.total_users;
    if (playsEl) playsEl.textContent = data.plays_today;

    const usersContainer = document.getElementById('admin-users-list');
    if (usersContainer && data.all_users) {
      let html = '<table style="width:100%; text-align:left;">';
      html += '<tr style="color:#1db954;"><th>ID</th><th>Email</th><th>Роль</th></tr>';
      data.all_users.forEach(user => {
        const roleColor = user.role === 'admin' ? '#ff4d4d' : '#b3b3b3';
        html += `<tr>
          <td style="padding: 3px 0;">${user.id}</td>
          <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">${escapeHTML(user.email)}</td>
          <td style="color: ${roleColor}; font-weight: bold;">${escapeHTML(user.role)}</td>
        </tr>`;
      });
      html += '</table>';
      usersContainer.innerHTML = html;
    }
  } catch (err) {
    console.error('Ошибка загрузки админ-статистики:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnShowUsers = document.getElementById('btn-show-users');
  if (btnShowUsers) {
    btnShowUsers.addEventListener('click', () => {
      const list = document.getElementById('admin-users-list');
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
    });
  }
});

async function performSearch(query) {
  if (!query || query.length < 2) return;
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ищем музыку...</p>';
  try {
    const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderSearchResults(data.tracks, data.albums);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка поиска.</p>';
  }
}

// 3. СОХРАНЕНИЕ ПЛЕЕРА
function savePlayerState() {
  if (!audioPlayer.src) return;
  const track = currentTracks[currentTrackIndex];
  if (!track) return;
  localStorage.setItem('muzlo_current_track', JSON.stringify(track));
  localStorage.setItem('muzlo_current_time', audioPlayer.currentTime);
  localStorage.setItem('muzlo_volume', volumeSlider.value);
}

async function restorePlayerState() {
  const savedTrackJson = localStorage.getItem('muzlo_current_track');
  const savedTime = parseFloat(localStorage.getItem('muzlo_current_time') || 0);
  const savedVolume = localStorage.getItem('muzlo_volume');

  if (savedVolume) {
    volumeSlider.value = savedVolume;
    updateVolume();
  }

  if (!savedTrackJson) return;

  try {
    const track = JSON.parse(savedTrackJson);
    document.querySelector('.player')?.classList.remove('hidden');
    playerTitle.textContent = track.title;
    playerArtist.textContent = track.artist_name || 'Неизвестен';
    if (track.cover_url) {
      playerCover.src = track.cover_url;
      playerCover.classList.remove('hidden');
    } else {
      playerCover.classList.add('hidden');
    }
    currentTrackRealDuration = track.duration || 0;
    totalTimeEl.textContent = formatTime(currentTrackRealDuration);

    audioPlayer.src = getStreamUrl(track);
    isPlaying = false;
    btnPlay.textContent = '▶';

    updateMediaSession(track);

    audioPlayer.addEventListener('loadedmetadata', () => {
      if (savedTime > 0 && savedTime < audioPlayer.duration) {
        audioPlayer.currentTime = savedTime;
        currentTimeEl.textContent = formatTime(savedTime);
      }
    }, { once: true });

  } catch (e) {}
}

// 4. РЕНДЕР
function renderTracks(tracksArray, isLibrary = false) {
  currentTracks = tracksArray || [];
  trackListEl.innerHTML = '';
  if (currentTracks.length === 0) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ничего не найдено.</p>';
    return;
  }

  currentTracks.forEach((track, index) => {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.index = index;

    const isLiked = userLikedTrackIds.has(String(track.track_id || track.id));
    let actionBtnHTML = isLibrary
      ? `<button class="btn-delete" title="Удалить">✕</button>`
      : `<button class="btn-like ${isLiked ? 'liked' : ''}" title="Сохранить">${isLiked ? '❤' : '♥'}</button>`;

    div.innerHTML = `
      <img src="${getValidCover(track.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
      <div class="track-info">
        <div class="track-title">${escapeHTML(track.title)}</div>
        <div class="track-artist"><span class="artist-link" data-artist="${escapeHTML(track.artist_name || 'Неизвестен')}">${escapeHTML(track.artist_name || 'Неизвестен')}</span></div>
      </div>
      <div class="track-duration">${formatTime(track.duration)}</div>
      ${actionBtnHTML}
    `;

    div.querySelector('.track-cover').onerror = function() {
      this.onerror = null;
      this.src = '/img/default-cover.png';
    };

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-like') || e.target.classList.contains('btn-delete') || e.target.classList.contains('artist-link')) return;
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      currentTrackIndex = index;
      playTrack(track);
    });

    const actionBtn = div.querySelector('.btn-like, .btn-delete');
    if (isLibrary) {
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Удалить этот трек?')) return;
        try {
          const res = await fetch(`/api/library/${track.track_id || track.id}`, { method: 'DELETE' });
          if (res.ok) {
            userLikedTrackIds.delete(String(track.track_id || track.id));
            navLibrary.click();
          }
        } catch (err) {}
      });
    } else {
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (actionBtn.classList.contains('liked')) return;
        try {
          const streamUrl = getStreamUrl(track);
          const res = await fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id: String(track.id), title: track.title, artist_name: track.artist_name,
              cover_url: track.cover_url, duration: track.duration, stream_url: streamUrl,
              genre: track.genre
            })
          });
          if (res.status === 401) {
            alert('Войдите в аккаунт!'); authModal.classList.add('active'); return;
          }
          if (res.ok) {
            actionBtn.classList.add('liked');
            actionBtn.textContent = '❤';
            userLikedTrackIds.add(String(track.id));
          }
        } catch (err) {}
      });
    }
    trackListEl.appendChild(div);
  });
}

function renderSearchResults(tracks, albums) {
  currentTracks = tracks || [];
  trackListEl.innerHTML = '';

  if (albums && albums.length > 0) {
    const albumHeader = document.createElement('h3');
    albumHeader.textContent = 'Альбомы и плейлисты';
    albumHeader.style.margin = '10px 0 15px 0';
    albumHeader.style.color = '#b3b3b3';
    albumHeader.style.fontSize = '18px';
    trackListEl.appendChild(albumHeader);

    albums.forEach(album => {
      const div = document.createElement('div');
      div.className = 'track-item';

      const isSaved = userSavedAlbumIds.has(String(album.id));

      div.innerHTML = `
        <img src="${getValidCover(album.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
        <div class="track-info">
          <div class="track-title">${escapeHTML(album.title)}</div>
          <div class="track-artist"><span>${escapeHTML(album.artist_name)} • ${album.track_count} треков</span></div>
        </div>
        <div class="track-duration" style="font-size: 20px;">💿</div>
        <button class="btn-like ${isSaved ? 'liked' : ''}" title="Сохранить">${isSaved ? '❤' : '♥'}</button>
      `;

      div.querySelector('.track-cover').onerror = function() {
        this.onerror = null;
        this.src = '/img/default-cover.png';
      };

      div.onclick = (e) => {
        if (e.target.classList.contains('btn-like')) return;
        loadAlbum(album.permalink_url);
      };

      const actionBtn = div.querySelector('.btn-like');
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (actionBtn.classList.contains('liked')) return;
        try {
          const res = await fetch('/api/library/albums', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              album_id: String(album.id), title: album.title, artist_name: album.artist_name,
              cover_url: album.cover_url, track_count: album.track_count, permalink_url: album.permalink_url
            })
          });
          if (res.status === 401) {
            alert('Войдите в аккаунт!'); authModal.classList.add('active'); return;
          }
          if (res.ok) {
            actionBtn.classList.add('liked');
            actionBtn.textContent = '❤';
            userSavedAlbumIds.add(String(album.id));
          }
        } catch (err) {}
      });

      trackListEl.appendChild(div);
    });
  }

  if (currentTracks.length > 0) {
    const trackHeader = document.createElement('h3');
    trackHeader.textContent = 'Треки';
    trackHeader.style.margin = '25px 0 15px 0';
    trackHeader.style.color = '#b3b3b3';
    trackHeader.style.fontSize = '18px';
    trackListEl.appendChild(trackHeader);

    currentTracks.forEach((track, index) => {
      const div = document.createElement('div');
      div.className = 'track-item';
      div.dataset.index = index;

      const isLiked = userLikedTrackIds.has(String(track.id));
      let actionBtnHTML = `<button class="btn-like ${isLiked ? 'liked' : ''}" title="Сохранить">${isLiked ? '❤' : '♥'}</button>`;

      div.innerHTML = `
        <img src="${getValidCover(track.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
        <div class="track-info">
          <div class="track-title">${escapeHTML(track.title)}</div>
          <div class="track-artist"><span class="artist-link" data-artist="${escapeHTML(track.artist_name || 'Неизвестен')}">${escapeHTML(track.artist_name || 'Неизвестен')}</span></div>
        </div>
        <div class="track-duration">${formatTime(track.duration)}</div>
        ${actionBtnHTML}
      `;

      div.querySelector('.track-cover').onerror = function() {
        this.onerror = null;
        this.src = '/img/default-cover.png';
      };

      div.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-like') || e.target.classList.contains('btn-delete') || e.target.classList.contains('artist-link')) return;
        document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        currentTrackIndex = index;
        playTrack(track);
      });

      const actionBtn = div.querySelector('.btn-like');
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (actionBtn.classList.contains('liked')) return;
        try {
          const streamUrl = getStreamUrl(track);
          const res = await fetch('/api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id: String(track.id), title: track.title, artist_name: track.artist_name,
              cover_url: track.cover_url, duration: track.duration, stream_url: streamUrl,
              genre: track.genre
            })
          });
          if (res.status === 401) {
            alert('Войдите в аккаунт!'); authModal.classList.add('active'); return;
          }
          if (res.ok) {
            actionBtn.classList.add('liked');
            actionBtn.textContent = '❤';
            userLikedTrackIds.add(String(track.id));
          }
        } catch (err) {}
      });

      trackListEl.appendChild(div);
    });
  }

  if ((!albums || albums.length === 0) && currentTracks.length === 0) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ничего не найдено.</p>';
  }
}

async function loadAlbum(albumUrl) {
  if (!albumUrl || albumUrl === 'undefined') {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка: неверная ссылка.</p>';
    return;
  }

  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка альбома...</p>';

  try {
    const res = await fetch(`/api/search/album?url=${encodeURIComponent(albumUrl)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);
    if (!data.tracks || data.tracks.length === 0) {
      trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">В этом альбоме нет доступных треков.</p>';
      return;
    }

    renderTracks(data.tracks);

    const backBtnHTML = `<button id="btn-back-search" style="margin-bottom: 20px; padding: 8px 16px; background: #282828; color: white; border: none; border-radius: 8px; cursor: pointer;">← Назад к поиску</button>`;
    trackListEl.insertAdjacentHTML('afterbegin', backBtnHTML);

    document.getElementById('btn-back-search').addEventListener('click', () => performSearch(lastSearchQuery));

  } catch (err) {
    console.error('Ошибка загрузки альбома:', err);
    trackListEl.innerHTML = `<p style="color:red; text-align:center; margin-top:40px;">${err.message}</p>`;
  }
}

trackListEl.addEventListener('click', (e) => {
  if (e.target.classList.contains('artist-link')) {
    e.stopPropagation();
    loadArtistPage(e.target.dataset.artist);
  }
});

// 5. АРТИСТ
async function loadArtistPage(artistName) {
  if (!artistName || artistName === 'Неизвестен') return;
  [navHome, navSearch, navLibrary, navWave, navProfile].forEach(el => el.classList.remove('active'));
  pageTitle.textContent = `Артист: ${artistName}`;
  searchContainer.style.display = 'none';
  profileStats.style.display = 'none';
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';

  try {
    const res = await fetchWithTimeout(`/api/search/artist?name=${encodeURIComponent(artistName)}`);
    const data = await res.json();
    renderTracks(data.tracks);
    const backBtnHTML = `<button id="btn-back-home" style="margin-bottom: 20px; padding: 8px 16px; background: #282828; color: white; border: none; border-radius: 8px; cursor: pointer;">← Назад</button>`;
    trackListEl.insertAdjacentHTML('afterbegin', backBtnHTML);
    document.getElementById('btn-back-home').addEventListener('click', () => navHome.click());
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки.</p>';
  }
}

// 6. ВОСПРОИЗВЕДЕНИЕ
function playTrack(track) {
  const playerEl = document.querySelector('.player');
  if (playerEl && playerEl.classList.contains('hidden')) {
    playerEl.classList.remove('hidden');
  }

  initAudioContext();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist_name || 'Неизвестен';

  if (track.cover_url) {
    playerCover.src = track.cover_url;
    playerCover.classList.remove('hidden');
  } else {
    playerCover.classList.add('hidden');
  }

  currentTrackRealDuration = track.duration || 0;
  totalTimeEl.textContent = formatTime(currentTrackRealDuration);
  currentTimeEl.textContent = '0:00';

  btnPlay.textContent = '⏳';
  isPlaying = false;

  audioPlayer.src = getStreamUrl(track);

  updateMediaSession(track);

  audioPlayer.addEventListener('playing', () => {
    isPlaying = true;
    btnPlay.textContent = '⏸';
    savePlayerState();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }, { once: true });

  audioPlayer.play().then(() => {
    fetch('/api/search/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track_id: track.id,
        title: track.title,
        artist_name: track.artist_name,
        duration: track.duration,
        genre: track.genre
      })
    }).catch(err => console.log('Не авторизован'));
  }).catch(err => {
    console.warn('Автовоспроизведение заблокировано:', err.message);
    btnPlay.textContent = '▶';
    isPlaying = false;
  });

  if (track.permalink_url) {
    fetch(`/api/search/info?url=${encodeURIComponent(track.permalink_url)}`)
      .then(r => r.json())
      .then(data => {
        if (data.duration) {
          currentTrackRealDuration = data.duration;
          totalTimeEl.textContent = formatTime(data.duration);
        }
      }).catch(e => {});
  }

  // Предзагрузка следующего трека для быстрого скипа
  if (currentTracks.length > 1) {
    const nextIndex = (currentTrackIndex + 1) % currentTracks.length;
    const nextTrack = currentTracks[nextIndex];
    if (nextTrack && nextTrack.stream_url) {
      if (!hiddenPreloader) {
        hiddenPreloader = new Audio();
        hiddenPreloader.preload = 'auto';
      }
      hiddenPreloader.src = nextTrack.stream_url;
      hiddenPreloader.load();
    }
  }
}

// --- MEDIA SESSION API ---
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;

  const cover = getAbsoluteCover(track.cover_url);

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || 'Muzlo',
    artist: track.artist_name || 'Неизвестен',
    album: 'Muzlo',
    artwork: [
      { src: cover, sizes: '96x96', type: 'image/jpeg' },
      { src: cover, sizes: '128x128', type: 'image/jpeg' },
      { src: cover, sizes: '192x192', type: 'image/jpeg' },
      { src: cover, sizes: '256x256', type: 'image/jpeg' },
      { src: cover, sizes: '384x384', type: 'image/jpeg' },
      { src: cover, sizes: '512x512', type: 'image/jpeg' }
    ]
  });

  try {
    navigator.mediaSession.setActionHandler('play', () => {
      audioPlayer.play();
      isPlaying = true;
      btnPlay.textContent = '⏸';
      navigator.mediaSession.playbackState = 'playing';
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audioPlayer.pause();
      isPlaying = false;
      btnPlay.textContent = '▶';
      navigator.mediaSession.playbackState = 'paused';
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => btnPrev.click());
    navigator.mediaSession.setActionHandler('nexttrack', () => btnNext.click());
  } catch (e) {
    console.log('MediaSession handlers:', e);
  }
}

btnPlay.addEventListener('click', () => {
  if (!audioPlayer.src) return;
  if (isPlaying) {
    audioPlayer.pause();
    btnPlay.textContent = '▶';
    isPlaying = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    savePlayerState();
  } else {
    audioPlayer.play();
    btnPlay.textContent = '⏸';
    isPlaying = true;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }
});

btnNext.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  const nextIndex = (currentTrackIndex + 1) % currentTracks.length;
  document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
  const nextEl = document.querySelector(`.track-item[data-index="${nextIndex}"]`);
  if (nextEl) nextEl.classList.add('active');
  currentTrackIndex = nextIndex;
  playTrack(currentTracks[nextIndex]);
});

btnPrev.addEventListener('click', () => {
  if (currentTracks.length === 0) return;
  const prevIndex = (currentTrackIndex - 1 + currentTracks.length) % currentTracks.length;
  document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
  const prevEl = document.querySelector(`.track-item[data-index="${prevIndex}"]`);
  if (prevEl) prevEl.classList.add('active');
  currentTrackIndex = prevIndex;
  playTrack(currentTracks[prevIndex]);
});

audioPlayer.addEventListener('timeupdate', () => {
  const duration = currentTrackRealDuration || audioPlayer.duration;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  if (duration && !isNaN(duration)) {
    totalTimeEl.textContent = formatTime(duration);
  }
  if (Math.floor(audioPlayer.currentTime) % 3 === 0) savePlayerState();
});

audioPlayer.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatTime(currentTrackRealDuration || audioPlayer.duration);
});

function updateVolume() {
  const value = parseInt(volumeSlider.value);
  volumeLabel.textContent = value + '%';
  if (value <= 100) {
    if (gainNode) gainNode.gain.value = 1;
    audioPlayer.volume = value / 100;
  } else {
    audioPlayer.volume = 1;
    if (gainNode) gainNode.gain.value = value / 100;
  }
}

volumeSlider.addEventListener('input', updateVolume);

audioPlayer.addEventListener('ended', () => {
  localStorage.removeItem('muzlo_current_track');
  localStorage.removeItem('muzlo_current_time');
  if (currentTracks.length === 0) return;
  const nextIndex = (currentTrackIndex + 1) % currentTracks.length;
  document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
  const nextEl = document.querySelector(`.track-item[data-index="${nextIndex}"]`);
  if (nextEl) nextEl.classList.add('active');
  currentTrackIndex = nextIndex;
  playTrack(currentTracks[nextIndex]);
});

window.addEventListener('beforeunload', savePlayerState);

// 7. НАВИГАЦИЯ (С ИСТОРИЕЙ)
function switchTab(activeTab, title, showSearch = false) {
  [navHome, navSearch, navLibrary, navWave, navProfile].forEach(el => el.classList.remove('active'));
  if (activeTab) activeTab.classList.add('active');
  pageTitle.textContent = title;
  searchContainer.style.display = showSearch ? 'block' : 'none';
  profileStats.style.display = 'none';
}

window.addEventListener('popstate', (event) => {
  isPoppingState = true;
  if (event.state && event.state.tab) {
    if (event.state.tab === 'home') navHome.click();
    else if (event.state.tab === 'search') navSearch.click();
    else if (event.state.tab === 'library') navLibrary.click();
    else if (event.state.tab === 'wave') navWave.click();
    else if (event.state.tab === 'profile') navProfile.click();
  } else {
    navHome.click();
  }
  isPoppingState = false;
});

navHome.addEventListener('click', async () => {
  if (!isPoppingState) history.pushState({ tab: 'home' }, '', '#home');
  switchTab(navHome, 'Рекомендации');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  await loadUserLikes();
  try {
    const res = await fetchWithTimeout('/api/search/trending');
    const data = await res.json();
    renderTracks(data.tracks);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Сервер не отвечает.</p>';
  }
});

navWave.addEventListener('click', async () => {
  if (!isPoppingState) history.pushState({ tab: 'wave' }, '', '#wave');
  switchTab(navWave, 'Моя волна');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Слушаем ваши вкусы...</p>';
  await loadUserLikes();
  try {
    const res = await fetch('/api/search/my-wave');
    if (res.status === 401) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Войдите в аккаунт.</p>';
      return;
    }
    const data = await res.json();
    if (data.error) {
      trackListEl.innerHTML = `<p style="color:red; text-align:center; margin-top:40px;">${data.error}</p>`;
      return;
    }
    renderTracks(data.tracks);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки волны.</p>';
  }
});

navProfile.addEventListener('click', async () => {
  if (!isPoppingState) history.pushState({ tab: 'profile' }, '', '#profile');
  switchTab(navProfile, 'Мой профиль');
  trackListEl.innerHTML = '';
  profileStats.style.display = 'block';
  profileStats.innerHTML = '<p style="text-align:center;">Загрузка статистики...</p>';

  try {
    const res = await fetch('/api/search/stats');
    if (res.status === 401) {
      profileStats.innerHTML = '<p style="color:red; text-align:center;">Войдите в аккаунт, чтобы увидеть статистику.</p>';
      return;
    }
    const data = await res.json();

    const hours = Math.floor(data.total_seconds / 3600);
    const minutes = Math.floor((data.total_seconds % 3600) / 60);

    profileStats.innerHTML = `
      <h2 style="margin-bottom: 20px;">Статистика прослушиваний</h2>
      <p style="font-size: 18px; margin-bottom: 20px;">Всего прослушано: <strong style="color:#1db954;">${hours} ч ${minutes} мин</strong></p>

      <h3 style="margin-bottom: 10px;">Топ артистов:</h3>
      <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
        ${data.top_artists.map(a => `<li style="padding: 5px 0; border-bottom: 1px solid #333;">${escapeHTML(a.artist_name)} — <span style="color:#b3b3b3;">${a.count} раз</span></li>`).join('') || '<li>Нет данных</li>'}
      </ul>

      <h3 style="margin-bottom: 10px;">Топ треков:</h3>
      <ul style="list-style: none; padding: 0;">
        ${data.top_tracks.map(t => `<li style="padding: 5px 0; border-bottom: 1px solid #333;">${escapeHTML(t.title)} — <span style="color:#b3b3b3;">${escapeHTML(t.artist_name)} (${t.count} раз)</span></li>`).join('') || '<li>Нет данных</li>'}
      </ul>
    `;
  } catch (err) {
    profileStats.innerHTML = '<p style="color:red; text-align:center;">Ошибка загрузки статистики.</p>';
  }
});

navSearch.addEventListener('click', async () => {
  if (!isPoppingState) history.pushState({ tab: 'search' }, '', '#search');
  switchTab(navSearch, 'Поиск по миру', true);
  searchInput.focus();
  await loadUserLikes();
  if (lastSearchQuery) {
    searchInput.value = lastSearchQuery;
    performSearch(lastSearchQuery);
  } else {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите название...</p>';
  }
});

let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  lastSearchQuery = query;
  if (query.length < 2) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Введите хотя бы 2 символа</p>';
    return;
  }
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ищем музыку...</p>';
  searchTimeout = setTimeout(() => performSearch(query), 600);
});

navLibrary.addEventListener('click', async () => {
  if (!isPoppingState) history.pushState({ tab: 'library' }, '', '#library');
  switchTab(navLibrary, 'Моя медиатека');
  trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Загрузка...</p>';
  try {
    const [resTracks, resAlbums] = await Promise.all([
      fetch('/api/library'),
      fetch('/api/library/albums')
    ]);

    if (resTracks.status === 401) {
      trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Войдите в аккаунт.</p>';
      return;
    }

    const dataTracks = await resTracks.json();
    const dataAlbums = resAlbums.ok ? await resAlbums.json() : { albums: [] };

    renderLibraryPage(dataTracks.tracks || [], dataAlbums.albums || []);
  } catch (err) {
    trackListEl.innerHTML = '<p style="color:red; text-align:center; margin-top:40px;">Ошибка загрузки.</p>';
  }
});

function renderLibraryPage(tracks, albums) {
  currentTracks = tracks || [];
  currentTrackIndex = -1;
  trackListEl.innerHTML = '';

  // Альбомы
  if (albums && albums.length > 0) {
    const albumHeader = document.createElement('h3');
    albumHeader.textContent = 'Сохраненные альбомы';
    albumHeader.style.margin = '10px 0 15px 0';
    albumHeader.style.color = '#b3b3b3';
    albumHeader.style.fontSize = '18px';
    trackListEl.appendChild(albumHeader);

    albums.forEach(album => {
      const div = document.createElement('div');
      div.className = 'track-item album-item';
      div.innerHTML = `
        <img src="${getValidCover(album.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
        <div class="track-info">
          <div class="track-title">${escapeHTML(album.title)}</div>
          <div class="track-artist"><span>${escapeHTML(album.artist_name)} • ${album.track_count} треков</span></div>
        </div>
        <div class="track-duration" style="font-size: 20px;">💿</div>
        <button class="btn-delete" title="Удалить">✕</button>
      `;
      div.querySelector('.track-cover').onerror = function() {
        this.onerror = null;
        this.src = '/img/default-cover.png';
      };
      div.onclick = (e) => {
        if (e.target.classList.contains('btn-delete')) return;
        loadAlbum(album.permalink_url);
      };
      const deleteBtn = div.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Удалить этот альбом из медиатеки?')) return;
        try {
          const res = await fetch(`/api/library/albums/${album.album_id}`, { method: 'DELETE' });
          if (res.ok) {
            userSavedAlbumIds.delete(String(album.album_id));
            navLibrary.click();
          }
        } catch (err) {}
      });
      trackListEl.appendChild(div);
    });
  }

  // Треки
  if (tracks && tracks.length > 0) {
    const trackHeader = document.createElement('h3');
    trackHeader.textContent = 'Сохраненные треки';
    trackHeader.style.margin = '25px 0 15px 0';
    trackHeader.style.color = '#b3b3b3';
    trackHeader.style.fontSize = '18px';
    trackListEl.appendChild(trackHeader);

    // Контейнер для кнопок — НЕ перерисовывается при сортировке
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'library-controls';
    controlsDiv.style.display = 'flex';
    controlsDiv.style.gap = '10px';
    controlsDiv.style.marginBottom = '20px';
    controlsDiv.innerHTML = `
      <button id="lib-shuffle" style="padding: 8px 16px; background: #1db954; color: #000; border: none; border-radius: 20px; font-weight: bold; cursor: pointer;">🔀 Перемешать</button>
      <button id="lib-asc" style="padding: 8px 16px; background: #282828; color: white; border: 1px solid #444; border-radius: 20px; cursor: pointer;">⬇️ Сверху вниз</button>
      <button id="lib-desc" style="padding: 8px 16px; background: #282828; color: white; border: 1px solid #444; border-radius: 20px; cursor: pointer;">⬆️ Снизу вверх</button>
    `;
    trackListEl.appendChild(controlsDiv);

    // Контейнер только для треков — его и перерисовываем
    const tracksContainer = document.createElement('div');
    tracksContainer.id = 'library-tracks-container';
    trackListEl.appendChild(tracksContainer);

    renderLibraryTracks(currentTracks, tracksContainer);

    document.getElementById('lib-shuffle').addEventListener('click', () => {
      const shuffled = shuffleArray(currentTracks);
      currentTracks = shuffled;
      currentTrackIndex = 0;
      renderLibraryTracks(currentTracks, tracksContainer);
      if (currentTracks.length > 0) {
        const first = tracksContainer.querySelector('.track-item');
        if (first) first.classList.add('active');
        playTrack(currentTracks[0]);
      }
    });

    document.getElementById('lib-asc').addEventListener('click', () => {
      const sorted = [...currentTracks].sort((a, b) => new Date(a.added_at || 0) - new Date(b.added_at || 0));
      currentTracks = sorted;
      currentTrackIndex = 0;
      renderLibraryTracks(currentTracks, tracksContainer);
      if (currentTracks.length > 0) {
        const first = tracksContainer.querySelector('.track-item');
        if (first) first.classList.add('active');
        playTrack(currentTracks[0]);
      }
    });

    document.getElementById('lib-desc').addEventListener('click', () => {
      const sorted = [...currentTracks].sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
      currentTracks = sorted;
      currentTrackIndex = 0;
      renderLibraryTracks(currentTracks, tracksContainer);
      if (currentTracks.length > 0) {
        const first = tracksContainer.querySelector('.track-item');
        if (first) first.classList.add('active');
        playTrack(currentTracks[0]);
      }
    });
  }

  if ((!albums || albums.length === 0) && (!tracks || tracks.length === 0)) {
    trackListEl.innerHTML = '<p style="color:#b3b3b3; text-align:center; margin-top:40px;">Ваша медиатека пуста.</p>';
  }
}

function renderLibraryTracks(tracks, container) {
  container.innerHTML = '';
  tracks.forEach((track, index) => {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.index = index;
    div.innerHTML = `
      <img src="${getValidCover(track.cover_url)}" class="track-cover" alt="Cover" referrerpolicy="no-referrer">
      <div class="track-info">
        <div class="track-title">${escapeHTML(track.title)}</div>
        <div class="track-artist"><span>${escapeHTML(track.artist_name || 'Неизвестен')}</span></div>
      </div>
      <div class="track-duration">${formatTime(track.duration)}</div>
      <button class="btn-delete" title="Удалить">✕</button>
    `;
    div.querySelector('.track-cover').onerror = function() {
      this.onerror = null;
      this.src = '/img/default-cover.png';
    };
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete')) return;
      document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      currentTrackIndex = index;
      playTrack(track);
    });
    const deleteBtn = div.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Удалить этот трек?')) return;
      try {
        const res = await fetch(`/api/library/${track.track_id || track.id}`, { method: 'DELETE' });
        if (res.ok) {
          userLikedTrackIds.delete(String(track.track_id || track.id));
          navLibrary.click();
        }
      } catch (err) {}
    });
    container.appendChild(div);
  });
}

// 8. АВТОРИЗАЦИЯ
authContainer.addEventListener('click', (e) => {
  if (e.target.id === 'btn-open-auth') authModal.classList.add('active');
  if (e.target.id === 'btn-logout') logout();
});

function updateAuthUI(user) {
  if (user) {
    authContainer.innerHTML = `
      <div class="profile-menu-container">
        <button class="btn-profile" id="btn-toggle-profile">👤 Аккаунт</button>
        <div class="profile-dropdown hidden" id="profile-dropdown">
          <div class="profile-email">${escapeHTML(user.email)}</div>
          <button class="btn-dropdown" id="btn-show-change-password">Сменить пароль</button>
          <button class="btn-dropdown btn-logout" id="btn-logout">Выйти</button>

          <div id="change-password-form" class="hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
            <input type="password" id="old-password" placeholder="Старый пароль" style="width: 100%; margin-bottom: 5px; padding: 8px; background: #121212; color: white; border: 1px solid #333; border-radius: 4px; box-sizing: border-box;">
            <input type="password" id="new-password-profile" placeholder="Новый пароль" style="width: 100%; margin-bottom: 5px; padding: 8px; background: #121212; color: white; border: 1px solid #333; border-radius: 4px; box-sizing: border-box;">
            <button id="btn-save-new-password" style="width: 100%; padding: 8px; background: #1db954; border: none; font-weight: bold; border-radius: 4px; cursor: pointer;">Сохранить</button>
          </div>
        </div>
      </div>
    `;
    loadUserLikes();

    const btnToggleProfile = document.getElementById('btn-toggle-profile');
    const profileDropdown = document.getElementById('profile-dropdown');

    btnToggleProfile.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (profileDropdown && !profileDropdown.contains(e.target) && e.target !== btnToggleProfile) {
        profileDropdown.classList.add('hidden');
      }
    });

    const btnShowChangePass = document.getElementById('btn-show-change-password');
    const changePassForm = document.getElementById('change-password-form');

    btnShowChangePass.addEventListener('click', () => {
      changePassForm.classList.toggle('hidden');
    });

    document.getElementById('btn-save-new-password').addEventListener('click', async () => {
      const oldPassword = document.getElementById('old-password').value;
      const newPassword = document.getElementById('new-password-profile').value;
      if (!oldPassword || !newPassword) return alert('Заполните оба поля');
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
          alert('Пароль успешно изменен!');
          changePassForm.classList.add('hidden');
          document.getElementById('old-password').value = '';
          document.getElementById('new-password-profile').value = '';
        } else {
          alert(data.error);
        }
      } catch (e) {
        alert('Ошибка сети');
      }
    });

    if (user.role === 'admin' && adminWidget) {
      adminWidget.style.display = 'block';
      loadAdminStats();
      if (adminInterval) clearInterval(adminInterval);
      adminInterval = setInterval(loadAdminStats, 30000);
    }
  } else {
    authContainer.innerHTML = `<button class="btn-auth" id="btn-open-auth">Войти</button>`;
    userLikedTrackIds.clear();
    userSavedAlbumIds.clear();
    if (adminWidget) adminWidget.style.display = 'none';
    if (adminInterval) { clearInterval(adminInterval); adminInterval = null; }
  }
}

document.getElementById('btn-close-auth').addEventListener('click', () => authModal.classList.remove('active'));
document.getElementById('btn-toggle-auth').addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  document.getElementById('modal-title').textContent = isLoginMode ? 'Вход' : 'Регистрация';
  document.getElementById('btn-submit-auth').textContent = isLoginMode ? 'Войти' : 'Зарегистрироваться';
  document.getElementById('auth-toggle-text').textContent = isLoginMode ? 'Нет аккаунта?' : 'Уже есть аккаунт?';
  document.getElementById('btn-toggle-auth').textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    authModal.classList.remove('active');
    updateAuthUI(data.user);
    authForm.reset();
    if (navLibrary.classList.contains('active')) navLibrary.click();
  } catch (err) { alert(err.message); }
});

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  updateAuthUI(null);
  navHome.click();
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      updateAuthUI(data.user);
    }
  } catch (err) {}
}

// --- СБРОС ПАРОЛЯ ---
const btnForgot = document.getElementById('btn-forgot-password');
const resetBlock = document.getElementById('reset-password-block');
const btnBackToLogin = document.getElementById('btn-back-to-login');
const btnSendCode = document.getElementById('btn-send-code');
const resetStep2 = document.getElementById('reset-step-2');
const btnConfirmReset = document.getElementById('btn-confirm-reset');
const authFormContainer = document.getElementById('auth-login-block');

if (btnForgot) {
  btnForgot.addEventListener('click', (e) => {
    e.preventDefault();
    if (authFormContainer) authFormContainer.style.display = 'none';
    resetBlock.style.display = 'block';
  });

  btnBackToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    if (authFormContainer) authFormContainer.style.display = 'block';
    resetBlock.style.display = 'none';
    resetStep2.style.display = 'none';
    btnSendCode.style.display = 'block';
    btnSendCode.textContent = 'Получить код';
  });

  btnSendCode.addEventListener('click', async () => {
    const email = document.getElementById('reset-email').value;
    if (!email) return alert('Введите почту');

    btnSendCode.textContent = 'Отправка...';
    btnSendCode.disabled = true;
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Код отправлен на почту! Проверьте папку Спам.');
        resetStep2.style.display = 'block';
        btnSendCode.style.display = 'none';
      } else {
        alert(data.error);
        btnSendCode.textContent = 'Получить код';
        btnSendCode.disabled = false;
      }
    } catch (e) {
      alert('Ошибка сети');
      btnSendCode.textContent = 'Получить код';
      btnSendCode.disabled = false;
    }
  });

  btnConfirmReset.addEventListener('click', async () => {
    const email = document.getElementById('reset-email').value;
    const code = document.getElementById('reset-code').value;
    const newPassword = document.getElementById('reset-new-password').value;

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Пароль успешно изменен! Войдите с новым паролем.');
        if (authFormContainer) authFormContainer.style.display = 'block';
        resetBlock.style.display = 'none';
        resetStep2.style.display = 'none';
        btnSendCode.style.display = 'block';
        btnSendCode.textContent = 'Получить код';
        btnSendCode.disabled = false;
        authForm.reset();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Ошибка сети');
    }
  });
}

// 9. ИМПОРТ
if (importBtn) {
  importBtn.addEventListener('click', () => {
    importModal.classList.add('active');
    importStatus.textContent = '';
    importUrlInput.value = '';
    importTextInput.value = '';
  });
}

btnCloseImport.addEventListener('click', () => importModal.classList.remove('active'));
importModal.addEventListener('click', (e) => { if (e.target === importModal) importModal.classList.remove('active'); });

btnDoImport.addEventListener('click', async () => {
  const url = importUrlInput.value.trim();
  const text = importTextInput.value.trim();

  if (text) {
    importStatus.style.color = '#1db954';
    importStatus.textContent = 'Ищем треки в SoundCloud...';
    btnDoImport.disabled = true;

    try {
      const res = await fetch('/api/search/import-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      if (data.tracks && data.tracks.length > 0) {
        importStatus.textContent = `Успех! Найдено треков: ${data.tracks.length}`;
        setTimeout(() => {
          importModal.classList.remove('active');
          switchTab(navSearch, 'Импортированные треки', false);
          renderTracks(data.tracks);
          btnDoImport.disabled = false;
          importTextInput.value = '';
        }, 1500);
      } else {
        importStatus.style.color = '#ff4d4d';
        importStatus.textContent = data.error || 'Ничего не найдено.';
        btnDoImport.disabled = false;
      }
    } catch (err) {
      importStatus.style.color = '#ff4d4d';
      importStatus.textContent = 'Ошибка соединения.';
      btnDoImport.disabled = false;
    }
    return;
  }

  if (!url) {
    importStatus.style.color = '#ff4d4d';
    importStatus.textContent = 'Введите ссылку или вставьте список треков';
    return;
  }

  let cleanUrl = url;
  if (cleanUrl.includes('?')) cleanUrl = cleanUrl.split('?')[0];

  let endpoint = '';
  if (cleanUrl.includes('soundcloud.com')) {
    endpoint = `/api/search/import-likes?url=${encodeURIComponent(cleanUrl)}`;
  } else if (cleanUrl.includes('music.yandex.ru')) {
    endpoint = `/api/search/import-yandex?url=${encodeURIComponent(cleanUrl)}`;
  } else {
    importStatus.style.color = '#ff4d4d';
    importStatus.textContent = 'Вставьте ссылку SoundCloud/Яндекс или список треков';
    return;
  }

  importStatus.style.color = '#1db954';
  importStatus.textContent = 'Загрузка... Пожалуйста, подождите.';
  btnDoImport.disabled = true;

  try {
    const res = await fetch(endpoint);
    const data = await res.json();

    if (data.tracks && data.tracks.length > 0) {
      importStatus.textContent = `Успех! Найдено треков: ${data.tracks.length}`;
      setTimeout(() => {
        importModal.classList.remove('active');
        switchTab(navSearch, 'Импортированные треки', false);
        renderTracks(data.tracks);
        btnDoImport.disabled = false;
      }, 1500);
    } else {
      importStatus.style.color = '#ff4d4d';
      importStatus.textContent = data.error || 'Треки не найдены.';
      btnDoImport.disabled = false;
    }
  } catch (err) {
    importStatus.style.color = '#ff4d4d';
    importStatus.textContent = 'Ошибка соединения.';
    btnDoImport.disabled = false;
  }
});

// 10. СТАРТ
initAudioContext();
restorePlayerState();
checkAuth();

const initialHash = window.location.hash.replace('#', '');
if (initialHash === 'library') navLibrary.click();
else if (initialHash === 'wave') navWave.click();
else if (initialHash === 'search') navSearch.click();
else if (initialHash === 'profile') navProfile.click();
else navHome.click();

// --- ЗАЩИТА (ПКМ и F12) ---
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', function(e) {
  if (e.keyCode === 123) { e.preventDefault(); return false; }
  if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) { e.preventDefault(); return false; }
  if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
});