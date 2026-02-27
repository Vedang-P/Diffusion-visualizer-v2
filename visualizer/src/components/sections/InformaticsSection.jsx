import { useState } from 'react';
import FlickeringGrid from '../ui/FlickeringGrid';

const THEORY_ITEMS = [
  {
    question: 'What is the core idea behind diffusion models?',
    answer:
      'A diffusion model learns to reverse progressive noise corruption. During training, clean latent samples are gradually noised; the network learns to predict that noise so sampling can run in reverse and recover structure.'
  },
  {
    question: 'What are forward and reverse processes in this context?',
    answer:
      'The forward process is fixed: it adds Gaussian noise step-by-step until a sample is nearly random. The reverse process is learned: at each step, the UNet estimates noise (or related parameterization), and the scheduler updates the latent toward a cleaner state.'
  },
  {
    question: 'Why does SDXL operate in latent space instead of pixel space?',
    answer:
      'Latent diffusion compresses images with a VAE, then denoises in that lower-dimensional space. This keeps memory and compute manageable while preserving enough semantic and spatial information for high-quality reconstruction.'
  },
  {
    question: 'How does text conditioning influence generated images?',
    answer:
      'Text embeddings condition denoising through cross-attention. Tokens compete for influence across layers and timesteps; stronger token activation often maps to regions where that concept is visually enforced.'
  },
  {
    question: 'What does classifier-free guidance (CFG) do?',
    answer:
      'CFG combines unconditional and conditional predictions to push samples toward prompt alignment. Higher CFG usually increases prompt adherence but can oversaturate or reduce naturalness if pushed too far.'
  },
  {
    question: 'Why do schedulers matter so much for output quality?',
    answer:
      'Schedulers define timestep spacing and update rules. They control how aggressively noise is removed at each step, which directly affects detail retention, stability, and speed-quality tradeoffs.'
  },
  {
    question: 'How should I interpret the metrics shown in Diffulizer?',
    answer:
      'Latent and noise norms indicate denoising magnitude, cosine drift tracks directional change between steps, KL shift indicates attention distribution movement, and token dominance approximates which prompt token is steering generation most strongly.'
  },
  {
    question: 'What drives divergence between realistic and anime runs?',
    answer:
      'Even with synchronized steps, different prompt styles shift attention allocation and latent trajectories. Domain priors alter where detail is preserved, how edges are stylized, and when semantic structure locks in.'
  }
];

export default function InformaticsSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="informatics-stage">
      <div className="informatics-shell">
        <aside className="informatics-title-card">
          <FlickeringGrid className="informatics-title-grid" squareSize={3} gridGap={6} color="#9cabca" maxOpacity={0.5} flickerChance={0.11} />
          <div className="informatics-title-content">
            <h2>Informatics</h2>
            <p>Theory and system behavior behind the diffusion pipeline.</p>
          </div>
        </aside>

        <div className="informatics-answers">
          {THEORY_ITEMS.map((item, index) => {
            const isOpen = index === openIndex;
            return (
              <article key={item.question} className={`informatics-item ${isOpen ? 'open' : ''}`}>
                <button
                  type="button"
                  className="informatics-question-row"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                >
                  <span>{item.question}</span>
                  <span className="informatics-toggle">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen ? (
                  <div className="informatics-answer">
                    <p>{item.answer}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
