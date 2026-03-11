# 🎓 Truyền thông số Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
- Use **bold** text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1.  Which of the following best describes the Nyquist Theorem's purpose?**
   > A.  To determine the maximum power output of a transmitter.
   > B.  To specify the minimum sampling rate required to accurately reconstruct a signal from its samples, ensuring no aliasing occurs.
   > C.  To calculate the optimal modulation scheme for a given channel.
   > D.  To measure the signal-to-noise ratio of a communication channel.
   <details>
     <summary>Reveal Answer</summary>
     <p><b>B</b>. To specify the minimum sampling rate required to accurately reconstruct a signal from its samples, ensuring no aliasing occurs.  The Nyquist Theorem is fundamentally about preventing aliasing, a distortion that occurs when a signal is sampled at a rate lower than twice its highest frequency component.</p>
   </details>

**2.  In the context of digital communication, what is Intersymbol Interference (ISI)?**
   > A.  The intentional addition of noise to a signal for security purposes.
   > B.  A distortion of the signal caused by the finite bandwidth of the channel, leading to the overlap of adjacent symbols and making them indistinguishable.
   > C.  The process of encoding data into a digital format.
   > D.  The amplification of a signal to increase its range.
   <details>
     <summary>Reveal Answer</summary>
     <p><b>B</b>. A distortion of the signal caused by the finite bandwidth of the channel, leading to the overlap of adjacent symbols and making them indistinguishable. ISI arises when the channel introduces delays or distortions that corrupt the shape of the symbols, blurring their boundaries.</p>
   </details>

**3.  What does "Dòng điện xoay chiều" refer to in the field of communication?**
   > A.  Direct Current (DC)
   > B.  Alternating Current (AC)
   > C.  Radio Waves
   > D.  Optical Signals
   <details>
     <summary>Reveal Answer</summary>
     <p><b>B</b>. Alternating Current (AC). This term directly translates to Alternating Current in Vietnamese, describing the type of electrical current commonly used in communication systems.</p>
   </details>

**4.  Which of the following accurately describes the function of a Bộ chuyển đổi tƣơng tự - số (ADC)?**
   > A.  It converts digital signals into analog signals.
   > B.  It converts analog signals into digital signals.
   > C.  It amplifies weak analog signals.
   > D.  It filters out unwanted noise from a signal.
   <details>
     <summary>Reveal Answer</summary>
     <p><b>B</b>. It converts analog signals into digital signals. An ADC (Analog to Digital Converter) is a critical component in digital communication systems, responsible for quantifying continuous analog signals into discrete digital representations.</p>
   </details>

**5.  The concept of “A” in a noisy channel primarily relates to:**
   > A.  The bandwidth of the channel.
   > B.  The power of the transmitted signal.
   > C.  The accuracy with which a receiver can estimate the signal amplitude in a noisy channel.
   > D.  The number of samples taken per second.
   <details>
     <summary>Reveal Answer</summary>
     <p><b>C</b>. The accuracy with which a receiver can estimate the signal amplitude in a noisy channel.  A (Delta) represents the signal-to-noise ratio (SNR) in decibels, indicating the receiver's ability to discern the signal's true amplitude amidst the noise.</p>
   </details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1.  Scenario:** A wireless communication system transmits data at a bandwidth of 2 MHz. Determine the minimum sampling rate required to prevent aliasing, according to the Nyquist Theorem.

<details>
  <summary>Reveal Solution</summary>
  <ol>
    <li><b>Formula:</b>  $$f_s >= 2f_max$$</li>
    <li><b>Identify f_max:</b>  The highest frequency component of the signal is equal to the bandwidth, so f_max = 2 MHz.</li>
    <li><b>Calculate f_s:</b>  $$f_s >= 2 * 2 MHz = 4 MHz$$</li>
    <li><b>Answer:</b>  The minimum sampling rate required is 4 MHz.</li>
  </ol>
</details>

**2.  Scenario:**  A communication channel has a capacity of C = 100 Mbps.  Assuming a constant bandwidth and transmit power, how does the addition of noise (represented by 0N) impact the channel capacity?  Explain briefly.

<details>
  <summary>Reveal Solution</summary>
  <p>Noise (0N) directly reduces the channel capacity (C).  Increased noise degrades the signal-to-noise ratio (SNR), which is a key parameter in determining the channel capacity. A lower SNR translates to a lower achievable data rate.</p>
</details>

**3.  Scenario:**  You are designing an antenna for a 10 GHz wireless system.  Based on the formula  $$λ > 1/10 λ_0$$, determine the minimum length of the antenna.  Assume the wavelength of electromagnetic waves (λ) is related to the wavelength of the electromagnetic wave (λ_0) by the formula $$λ = c/f$$, where c is the speed of light (approximately 3 x 10<sup>8</sup> m/s).

<details>
  <summary>Reveal Solution</summary>
  <ol>
    <li><b>Formula:</b> $$λ > 1/10 λ_0$$</li>
    <li><b>Calculate λ:</b> λ = c/f = (3 x 10<sup>8</sup> m/s) / 10 GHz = (3 x 10<sup>8</sup> m/s) / (10<sup>9</sup> Hz) = 0.3 m</li>
    <li><b>Calculate 1/10 λ_0:</b> 1/10 * 0.3 m = 0.03 m</li>
    <li><b>Determine antenna length:</b> λ > 0.03 m, so the minimum antenna length is greater than 0.03 m.  In practice, a larger antenna length would be used for efficient radiation.</li>
    <li><b>Answer:</b> The minimum antenna length is greater than 0.03 meters.</li>
  </ol>
</details>
