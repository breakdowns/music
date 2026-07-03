const audio = document.getElementById('mainAudio'), 
      playBtn = document.getElementById('playBtn'), 
      playIcon = document.getElementById('playIcon'), 
      prevBtn = document.getElementById('prevBtn'), 
      nextBtn = document.getElementById('nextBtn'), 
      shuffleBtn = document.getElementById('shuffleBtn'), 
      repeatBtn = document.getElementById('repeatBtn');

const trackTitle = document.getElementById('trackTitle'), 
      trackArtist = document.getElementById('trackArtist'), 
      trackCover = document.getElementById('trackCover'), 
      lyricsWrapper = document.getElementById('lyricsWrapper'), 
      lyricsContainer = document.getElementById('lyricsContainer'), 
      progressBar = document.getElementById('progressBar'), 
      currentTimeEl = document.getElementById('currentTime'), 
      durationEl = document.getElementById('duration'), 
      volumeSlider = document.getElementById('volumeSlider'), 
      playlistContainer = document.getElementById('playlist'), 
      searchBar = document.getElementById('searchBar');

let tracks = [], currentTracksDisplay = [], parsedLyrics = [];
let currentIndex = 0, isShuffle = false, isRepeat = false;

let isChangingTrack = false;
let lastKnownDurationText = '0:00';
let isPreloaded = false;
let isUserScrollingLyrics = false;
let lyricScrollTimeout = null;
let isSeeking = false;

audio.crossOrigin = "anonymous";

function updateSliderBg(slider, percentage, color = '#1ed760') {
    const thumbWidth = 15; 
    const offset = (thumbWidth / 2) - (percentage / 100) * thumbWidth;
    slider.style.background = `linear-gradient(to right, ${color} calc(${percentage}% + ${offset}px), #4f4f4f calc(${percentage}% + ${offset}px))`;
}

const savedVolume = localStorage.getItem('volume') !== null ? parseFloat(localStorage.getItem('volume')) : 0.5; 
audio.volume = savedVolume; 
volumeSlider.value = savedVolume; 
updateSliderBg(volumeSlider, savedVolume * 100);
updateSliderBg(progressBar, 0, '#ffffff');

function formatTime(s) { 
    if (isNaN(s)) return '0:00'; 
    const m = Math.floor(s / 60), sec = Math.floor(s % 60); 
    return `${m}:${sec < 10 ? '0' : ''}${sec}`; 
}

function updateMediaSession() {
    if ('mediaSession' in navigator) {
        const track = tracks[currentIndex];
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || "Unknown Title",
            artist: track.artist || "Unknown Artist",
            album: 'Breakdowns Music',
            artwork: [
                { src: track.cover || "images/breakdowns.png", sizes: '512x512', type: 'image/jpeg' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => { playAudioDirectly(); });
        navigator.mediaSession.setActionHandler('pause', () => { pauseAudioDirectly(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (isShuffle) {
                let n = Math.floor(Math.random() * tracks.length);
                loadTrack(n);
            } else {
                let p = currentIndex - 1; if (p < 0) p = tracks.length - 1;
                loadTrack(p); 
            }
            playAudioDirectly();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => { playNextTrack(); });

        try {
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                audio.currentTime = details.seekTime;
                updateMediaSessionState();
            });
        } catch (e) {}
    }
}

function updateMediaSessionState() {
    if ('mediaSession' in navigator && audio.duration && !isNaN(audio.duration)) {
        navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: audio.currentTime
            });
        } catch (e) {}
    }
}

function playAudioDirectly() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
    }
    
    audio.play().then(() => {
        playIcon.textContent = 'pause';
        updateMediaSessionState();
    }).catch(e => {
        console.error("Playback error:", e);
        playIcon.textContent = 'play_arrow';
    });
}

function pauseAudioDirectly() {
    audio.pause();
    playIcon.textContent = 'play_arrow';
    updateMediaSessionState();
}

function updateDynamicBackground(src) {
    if (document.hidden) return; 
    const img = new Image(); 
    img.crossOrigin = "Anonymous"; 
    img.src = src;
    img.onload = () => { 
        try { 
            const cH = document.createElement('canvas'), ctxH = cH.getContext('2d'); 
            cH.width = 1; cH.height = 1; 
            ctxH.drawImage(img, 0, 0, 1, 1); 
            const [r, g, b] = ctxH.getImageData(0, 0, 1, 1).data; 
            document.body.style.setProperty('--dynamic-r', Math.max(12, Math.min(r, 45))); 
            document.body.style.setProperty('--dynamic-g', Math.max(12, Math.min(g, 45))); 
            document.body.style.setProperty('--dynamic-b', Math.max(12, Math.min(b, 45))); 
        } catch (e) {} 
    };
}

function parseLRC(text) { 
    const res = []; 
    text.split('\n').forEach(l => { 
        const matches = [...l.matchAll(/\[(\d+):(\d+)(?:\.(\d+))?\]/g)]; 
        matches.forEach(m => { 
            const t = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 100 : 0), 
                  txt = l.replace(/\[.*?\]/g, '').trim(); 
            if (txt) res.push({ time: t, text: txt }); 
        }); 
    }); 
    return res.sort((a, b) => a.time - b.time); 
}

function renderLyrics() { 
    parsedLyrics.forEach((line, i) => { 
        const p = document.createElement('p'); 
        p.className = 'lyric-line'; 
        p.id = `line-${i}`; 
        p.textContent = line.text; 
        p.onclick = () => { 
            audio.currentTime = line.time; 
            isUserScrollingLyrics = false;
        }; 
        lyricsWrapper.appendChild(p); 
    }); 
}

function renderStaticLyrics(text) { 
    text.split('\n').forEach(l => { 
        const c = l.replace(/\[.*?\]/g, '').trim(); 
        if (c) { 
            const p = document.createElement('p'); 
            p.className = 'lyric-line active'; 
            p.textContent = c; 
            lyricsWrapper.appendChild(p); 
        } 
    }); 
}

function renderPlaylist(arr) {
    playlistContainer.innerHTML = ''; 
    arr.forEach((track) => {
        const oIdx = tracks.findIndex(t => t.src === track.src), 
              item = document.createElement('div');
        item.className = `track-item ${oIdx === currentIndex ? 'active' : ''}`;
        
        const displayTitle = track.title || "Unknown Title";
        const displayArtist = track.artist || "Unknown Artist";
        const displayCover = track.cover || "images/breakdowns.png";
        
        item.innerHTML = `<img src="${displayCover}" onerror="this.src='images/breakdowns.png'"><div><strong>${displayTitle}</strong><br><small style="color:var(--text-muted);font-size:0.8rem;">${displayArtist}</small></div>`;
        item.addEventListener('click', () => { 
            loadTrack(oIdx); 
            playAudioDirectly();
        }); 
        playlistContainer.appendChild(item);
    });
}

function loadTrack(index) {
    isChangingTrack = true;
    isUserScrollingLyrics = false;
    isPreloaded = false; 
    
    if (!document.hidden) {
        trackTitle.classList.add('shimmer-loading');
        trackArtist.classList.add('shimmer-loading');
        trackCover.classList.add('shimmer-loading');
    }

    currentIndex = index; 
    localStorage.setItem('currentIndex', index); 
    const track = tracks[index];
    
    trackTitle.textContent = track.title || "Unknown Title"; 
    trackArtist.textContent = track.artist || "Unknown Artist"; 
    trackCover.src = track.cover || "images/breakdowns.png"; 
    
    progressBar.value = 0;
    updateSliderBg(progressBar, 0, '#ffffff');
    currentTimeEl.textContent = '0:00'; 
    durationEl.textContent = lastKnownDurationText;

    lyricsContainer.style.opacity = '0';
    
    audio.src = track.src; 
    
    updateMediaSession(); 

    const currentTrackSrc = track.src;
    const fadeOutAnim = new Promise(resolve => setTimeout(resolve, 300));

    if (track.lyricsSrc) {
        Promise.all([
            fetch(track.lyricsSrc, { cache: "force-cache" }).then(res => {
                if (!res.ok) throw new Error("Network");
                return res.text();
            }),
            fadeOutAnim
        ])
        .then(([text]) => { 
            if (tracks[currentIndex].src !== currentTrackSrc) return;
            
            parsedLyrics = parseLRC(text); 
            lyricsContainer.scrollTop = 0;
            lyricsWrapper.innerHTML = ''; 
            parsedLyrics.length > 0 ? renderLyrics() : renderStaticLyrics(text); 
            
            lyricsContainer.style.display = "block"; 
            void lyricsWrapper.offsetWidth; 
            lyricsContainer.style.opacity = '1';
            isChangingTrack = false;
        })
        .catch(() => {
            fadeOutAnim.then(() => {
                if (tracks[currentIndex].src === currentTrackSrc) {
                    parsedLyrics = [];
                    lyricsContainer.scrollTop = 0;
                    lyricsWrapper.innerHTML = '';
                    lyricsContainer.style.display = "none";
                    isChangingTrack = false;
                }
            });
        });
    } else { 
        fadeOutAnim.then(() => {
            if (tracks[currentIndex].src !== currentTrackSrc) return;
            parsedLyrics = [];
            lyricsContainer.scrollTop = 0;
            lyricsWrapper.innerHTML = '';
            lyricsContainer.style.display = "none";
            isChangingTrack = false;
        });
    }
    
    renderPlaylist(currentTracksDisplay); 
    updateDynamicBackground(track.cover || "images/breakdowns.png");

    if (!document.hidden) {
        setTimeout(() => {
            const trackTitleEl = document.getElementById('trackTitle');
            const trackInfoEl = document.querySelector('.track-info');
            if (trackTitleEl && trackInfoEl) {
                const parentWidth = trackInfoEl.clientWidth;
                const textWidth = trackTitleEl.scrollWidth;
                if (textWidth > parentWidth) {
                    const jarakGeser = parentWidth - textWidth - 25; 
                    trackTitleEl.style.setProperty('--marquee-jarak', `${jarakGeser}px`);
                    trackTitleEl.style.animation = 'marqueeDinamis 8s linear infinite alternate';
                    trackTitleEl.style.paddingRight = '25px';
                } else {
                    trackTitleEl.style.animation = 'none';
                    trackTitleEl.style.paddingRight = '0px';
                }
            }
        }, 100);
    }
}

function playNextTrack() {
    let n = currentIndex + 1; 
    if (isShuffle) n = Math.floor(Math.random() * tracks.length); 
    else if (n >= tracks.length) n = 0; 
    
    loadTrack(n); 
    playAudioDirectly();
}

fetch('playlist.json')
    .then(res => res.json())
    .then(data => { 
        tracks = data.playlist; 
        currentTracksDisplay = tracks; 
        const savedIndex = parseInt(localStorage.getItem('currentIndex')) || 0; 
        if (tracks.length > 0) loadTrack(savedIndex >= 0 && savedIndex < tracks.length ? savedIndex : 0); 
    });

audio.addEventListener('canplay', () => {
    if (audio.duration && !isNaN(audio.duration)) {
        lastKnownDurationText = formatTime(audio.duration);
        durationEl.textContent = lastKnownDurationText;
    }
    trackTitle.classList.remove('shimmer-loading');
    trackArtist.classList.remove('shimmer-loading');
    trackCover.classList.remove('shimmer-loading');
});

audio.addEventListener('waiting', () => {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
    }
});

audio.addEventListener('playing', () => {
    if (audio.duration && !isNaN(audio.duration)) {
        lastKnownDurationText = formatTime(audio.duration);
        durationEl.textContent = lastKnownDurationText;
    }
    updateMediaSessionState();
});

audio.addEventListener('pause', () => { updateMediaSessionState(); });

audio.addEventListener('loadedmetadata', () => { 
    if (audio.duration && !isNaN(audio.duration)) {
        lastKnownDurationText = formatTime(audio.duration);
        durationEl.textContent = lastKnownDurationText; 
    }
});

searchBar.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim(); 
    currentTracksDisplay = tracks.filter(t => (t.title && t.title.toLowerCase().includes(q)) || (t.artist && t.artist.toLowerCase().includes(q))); 
    renderPlaylist(currentTracksDisplay); 
});

audio.addEventListener('error', () => {
    durationEl.textContent = lastKnownDurationText;
    trackTitle.classList.remove('shimmer-loading');
    trackArtist.classList.remove('shimmer-loading');
    trackCover.classList.remove('shimmer-loading');
});

trackCover.addEventListener('error', () => {
    trackCover.src = "images/breakdowns.png";
});

playBtn.addEventListener('click', () => { audio.paused ? playAudioDirectly() : pauseAudioDirectly(); });
nextBtn.addEventListener('click', () => { playNextTrack(); });

prevBtn.addEventListener('click', () => { 
    if (isShuffle) {
        let n = Math.floor(Math.random() * tracks.length);
        loadTrack(n);
    } else {
        let p = currentIndex - 1; if (p < 0) p = tracks.length - 1; 
        loadTrack(p); 
    }
    playAudioDirectly();
});

shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('active', isShuffle); });
repeatBtn.addEventListener('click', () => { isRepeat = !isRepeat; repeatBtn.classList.toggle('active', isRepeat); });

volumeSlider.addEventListener('input', (e) => { 
    const v = e.target.value; 
    audio.volume = v; 
    localStorage.setItem('volume', v); 
    updateSliderBg(volumeSlider, v * 100);
});

const triggerUserScroll = () => {
    isUserScrollingLyrics = true;
    if (lyricScrollTimeout) clearTimeout(lyricScrollTimeout);
    lyricScrollTimeout = setTimeout(() => {
        isUserScrollingLyrics = false;
    }, 2000);
};

lyricsContainer.addEventListener('touchstart', triggerUserScroll, {passive: true});
lyricsContainer.addEventListener('mousedown', triggerUserScroll);
lyricsContainer.addEventListener('wheel', triggerUserScroll, {passive: true});

progressBar.addEventListener('input', (e) => {
    isSeeking = true;
    const pct = e.target.value;
    updateSliderBg(progressBar, pct);
    if (audio.duration) {
        currentTimeEl.textContent = formatTime((pct / 100) * audio.duration);
    }
});

progressBar.addEventListener('change', (e) => {
    if (audio.duration) {
        audio.currentTime = (e.target.value / 100) * audio.duration;
        updateMediaSessionState();
    }
    isSeeking = false;
});

audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return; 
    
    const currentPercentage = (audio.currentTime / audio.duration) * 100;
    if (!isSeeking) {
        progressBar.value = currentPercentage;
        updateSliderBg(progressBar, currentPercentage);
        currentTimeEl.textContent = formatTime(audio.currentTime); 
    }
    
    if (audio.duration - audio.currentTime <= 20 && !isPreloaded && !isRepeat) {
        isPreloaded = true;
        let nextIdx = currentIndex + 1;
        if (isShuffle) nextIdx = Math.floor(Math.random() * tracks.length);
        else if (nextIdx >= tracks.length) nextIdx = 0;
        
        if (tracks[nextIdx] && tracks[nextIdx].lyricsSrc) {
            fetch(tracks[nextIdx].lyricsSrc, { cache: "force-cache" }).catch(() => {});
        }
    }

    if (document.hidden) return;

    if (isChangingTrack || parsedLyrics.length === 0) return;

    if (parsedLyrics.length > 0) {
        const activeIndex = parsedLyrics.findLastIndex(l => audio.currentTime >= l.time);
        const lines = document.querySelectorAll('.lyric-line');
        lines.forEach((el, i) => { el.classList.toggle('active', i === activeIndex); });
        
        if (!isUserScrollingLyrics && activeIndex !== -1 && lines[activeIndex]) {
            const activeLine = lines[activeIndex];
            const containerHeight = lyricsContainer.clientHeight;
            const offsetTop = activeLine.offsetTop;
            const lineHeight = activeLine.clientHeight;
            const scrollAmount = offsetTop - (containerHeight / 2) + (lineHeight / 2);
            
            lyricsContainer.scrollTop = scrollAmount;
        }
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audio.duration && parsedLyrics.length > 0 && !isChangingTrack) {
        const activeIndex = parsedLyrics.findLastIndex(l => audio.currentTime >= l.time);
        const lines = document.querySelectorAll('.lyric-line');
        if (activeIndex !== -1 && lines[activeIndex]) {
            const activeLine = lines[activeIndex];
            const containerHeight = lyricsContainer.clientHeight;
            const scrollAmount = activeLine.offsetTop - (containerHeight / 2) + (activeLine.clientHeight / 2);
            lyricsContainer.scrollTop = scrollAmount;
        }
    }
});

audio.addEventListener('ended', () => { isRepeat ? audio.play() : playNextTrack(); });
