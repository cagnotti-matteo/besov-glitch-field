# Besov Field

A pixelated visualisation of a rough two-dimensional drift field and its mollified shadow.

The deployed page is available at:

[https://cagnotti-matteo.github.io/besov-glitch-field/](https://cagnotti-matteo.github.io/besov-glitch-field/)

## Idea

This sketch is inspired by distributional stochastic differential equations of the form

\[
dX_t = b(X_t)\,dt + dB_t,
\]

where the drift \(b\) may have negative regularity. In such a regime, the drift is not necessarily a classical vector field that can be drawn pointwise.

Instead, the visualisation shows a mollified version

\[
b^\varepsilon = P_\varepsilon b,
\]

interpreted as a visible approximation of the underlying rough object.

The field is generated as a cheap multiscale random Fourier-like field. It is not intended as an exact Besov sampler; the goal is visual monotonicity: smoother, more coherent fields for larger regularity, and more pixelated high-frequency structure for lower regularity.

## Controls

- **\(\alpha\)** — roughness/regularity parameter.
  - Larger \(\alpha\): smoother, more coherent regions.
  - Negative \(\alpha\): glitchier, high-frequency, distributional-looking structure.

- **\(\varepsilon\)** — mollification scale.
  - Larger \(\varepsilon\): stronger smoothing, clearer visible shadow.
  - Smaller \(\varepsilon\): less smoothing, rougher field.

- **\(N\)** — number of tracer particles.

- **\(v\)** — animation speed.

- **field** — toggles the pixelated drift landscape.

- **tracers** — toggles moving particles advected by the visible drift.

- **arrows** — toggles sparse vector arrows showing drift direction.

## Visual language

The current version uses a monochrome field:

- field opacity encodes the magnitude of the mollified drift;
- orange dots are particles moving through the field;
- optional arrows show the direction of the vector field.

## Implementation

The project is built with:

- [Vite](https://vite.dev/)
- React
- TypeScript
- HTML canvas

The pixel field is cached and redrawn only when the parameters or seed change, so the animation can remain responsive while the tracer particles move every frame.
