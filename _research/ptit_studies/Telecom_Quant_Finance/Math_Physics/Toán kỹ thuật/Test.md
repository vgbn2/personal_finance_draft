# 🎓 Toán kỹ thuật Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check

- **1. What is an extended complex number?**
    A. A number that can only be expressed in the form a + bi.
    B. A number that includes real numbers and complex numbers.
    C. A number that extends the set of real numbers to include numbers of the form a + bi, where a and b are real numbers and i is the imaginary unit (i² = -1).
    D. A number that is only defined in the complex plane.

    <details>
      <summary>Reveal Answer</summary>
      C. A number that extends the set of real numbers to include numbers of the form a + bi, where a and b are real numbers and i is the imaginary unit (i² = -1).
    </details>

- **2. What does the term "neighborhood" refer to in the context of complex analysis?**
    A. A region where the imaginary part of a complex number is zero.
    B. A region containing a point, used to define concepts like limits and continuity.
    C. A region where the magnitude of a complex number is greater than one.
    D. A region that is closed and bounded.

    <details>
      <summary>Reveal Answer</summary>
      B. A region containing a point, used to define concepts like limits and continuity.
    </details>

- **3. What is a complex function?**
    A. A function that only takes real values as input.
    B. A function that takes a complex number as input, often represented as f(z) with z being a complex number.
    C. A function that is constant throughout its domain.
    D. A function that is defined only for positive values of z.

    <details>
      <summary>Reveal Answer</summary>
      B. A function that takes a complex number as input, often represented as f(z) with z being a complex number.
    </details>

- **4.  The Cauchy-Riemann equations are a fundamental requirement for:**
    A.  Functions that can be easily plotted in the complex plane.
    B.  Functions that are differentiable in the complex plane.
    C.  Functions that have a finite value at all points in the complex plane.
    D.  Functions that are constant along curves in the complex plane.

    <details>
      <summary>Reveal Answer</summary>
      B. Functions that are differentiable in the complex plane.
    </details>

- **5. What is the "modulus" of a complex number?**
    A. The angle between the real axis and the line connecting the origin to the complex number's representation.
    B. The distance of the complex number from the origin in the complex plane.
    C. The magnitude of the imaginary part of the complex number.
    D. The real part of the complex number.

    <details>
      <summary>Reveal Answer</summary>
      C. The magnitude of the imaginary part of the complex number.
    </details>

## Part II: Formula Application & Short Answer

**1. Scenario:** You are analyzing the flow of a fluid in a complex plane. The velocity field is described by the complex function v(z) = u(z) + i*v(z), where u(z) and v(z) are functions of x and y.  You need to determine if the fluid flow is irrotational.

**Question:** What condition must the functions u(z) and v(z) satisfy to ensure the fluid flow is irrotational?

<details>
  <summary>Reveal Solution</summary>
  The fluid flow is irrotational if and only if the rotation tensor (curl) is zero.  This is equivalent to the Cauchy-Riemann equations holding: uxx = vyy and uyy = vxx.  This guarantees that the components of the rotation tensor are zero, indicating no local rotation.
</details>

**2. Scenario:** A signal is represented as a complex number z = 2 + 3i.  You want to calculate the signal's magnitude.

**Question:**  Calculate the magnitude of the complex number z = 2 + 3i.

<details>
  <summary>Reveal Solution</summary>
  The magnitude (or modulus) of a complex number z = x + iy is given by |z| = √(x² + y²).  Therefore, |z| = √(2² + 3²) = √(4 + 9) = √13.
</details>

**3. Scenario:** You are working with a signal that is represented in polar form as z = r(cos θ + i sin θ).  You know that r = 5 and θ = π/3.

**Question:**  Express the complex number z in its standard rectangular form (a + bi).
</details>

<details>
  <summary>Reveal Solution</summary>
  Using the polar form z = r(cos θ + i sin θ), we have:
  z = 5(cos(π/3) + i sin(π/3))
  Since cos(π/3) = 1/2 and sin(π/3) = √3/2,
  z = 5(1/2 + i√3/2)
  z = (5/2) + (5√3/2)i
</details>
