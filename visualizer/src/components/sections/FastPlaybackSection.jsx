import FlickeringGrid from '../ui/FlickeringGrid';

export default function FastPlaybackSection({
  sectionRef,
  loading,
  error,
  ready,
  realisticImage,
  animeImage,
  step,
  maxStep,
  progress
}) {
  return (
    <section ref={sectionRef} className="playback-stage">
      <div className="playback-header">
        <h2>Fast-forward diffusion demo</h2>
        <p>Playback accelerates while this section is in view.</p>
      </div>

      {loading ? <p className="status">Loading bundled preset datasets...</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      {ready ? (
        <>
          <div className="playback-grid">
            <article className="play-card">
              <div className="play-card-grid-accent">
                <FlickeringGrid squareSize={3} gridGap={5} color="#8da0c6" maxOpacity={0.5} flickerChance={0.09} />
              </div>
              <header>
                <h3>Realistic</h3>
                <span>SDXL preset</span>
              </header>
              <div className="play-media">
                {realisticImage ? <img className="play-frame" src={realisticImage} alt={`Realistic diffusion step ${step}`} /> : null}
              </div>
            </article>

            <article className="play-card">
              <div className="play-card-grid-accent">
                <FlickeringGrid squareSize={3} gridGap={5} color="#b494db" maxOpacity={0.5} flickerChance={0.09} />
              </div>
              <header>
                <h3>Anime</h3>
                <span>SDXL preset</span>
              </header>
              <div className="play-media">
                {animeImage ? <img className="play-frame" src={animeImage} alt={`Anime diffusion step ${step}`} /> : null}
              </div>
            </article>
          </div>

          <div className="playback-progress">
            <div className="track">
              <div className="fill" style={{ width: `${progress}%` }} />
            </div>
            <p>
              Step {step} / {maxStep}
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
