# 🎓 Giải tích hàm một biến số (Giải tích 1) Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check
Create exactly 5 Multiple Choice Questions testing the provided definitions.
- Use bold text for the question.
- Provide 4 options (A, B, C, D) using blockquotes for readability.
- **Hide the answer** using a `<details><summary>Reveal Answer</summary>` tag immediately after the options. Include a brief explanation in the hidden section.

**1. Which of the following best describes the concept of a derivative in calculus?**
   > A.  The rate at which a function's output changes with respect to its input.
   > B.  The area under a curve.
   > C.  The slope of a tangent line to a curve at a given point.
   > D.  The integral of a function.
   <details><summary>Reveal Answer</summary>
   <p><b>Correct Answer: A</b></p>
   <p>The derivative represents the instantaneous rate of change of a function. It's fundamentally about how the output (y) changes as the input (x) changes, and is directly related to the slope of the tangent line.</p>
   </details>

**2. What is the primary purpose of the Fundamental Theorem of Calculus?**
   > A.  To calculate the area of a complex region.
   > B.  To establish a connection between differentiation and integration.
   > C.  To find the maximum and minimum values of a function.
   > D.  To solve differential equations.
   <details><summary>Reveal Answer</summary>
   <p><b>Correct Answer: B</b></p>
   <p>The Fundamental Theorem of Calculus links differentiation and integration. It shows how differentiation and integration are inverse operations, allowing us to calculate one using the other.</p>
   </details>

**3. The definition of the derivative of a function *f(x)* at a point *x = a* is represented as:**
   > A.  ∫<sub>a</sub><sup>x</sup> f(t) dt
   > B.  lim<sub>h→0</sub> (f(a + h) - f(a)) / h
   > C.  f(a)
   > D.  f'(x)
   <details><summary>Reveal Answer</summary>
   <p><b>Correct Answer: B</b></p>
   <p>This is the limit definition of the derivative, which calculates the instantaneous rate of change by finding the slope of a secant line as the change in *x* (h) approaches zero.</p>
   </details>

**4. What does the notation *f'(x)* represent?**
   > A.  The integral of the function *f(x)*.
   > B.  The derivative of the function *f(x)*.
   > C.  The area under the curve of *f(x)*.
   > D.  The limit of *f(x)* as *x* approaches infinity.
   <details><summary>Reveal Answer</summary>
   <p><b>Correct Answer: B</b></p>
   <p>*f'(x)* is a standard notation representing the derivative of the function *f(x)*, indicating the rate of change of *f(x)* with respect to *x*.</p>
   </details>

**5. Which of the following is a key requirement for the limit definition of the derivative to be valid?**
   > A.  *f(x)* must be a constant function.
   > B.  *f(x)* must be continuous at *x = a*.
   > C.  *f(x)* must be differentiable at *x = a*.
   > D.  *f(x)* must be defined at *x = a*.
   <details><summary>Reveal Answer</summary>
   <p><b>Correct Answer: B</b></p>
   <p>The limit definition of the derivative relies on the concept of a limit, which necessitates that *f(x)* be continuous at *x = a*.  Continuity ensures that the limit exists.</p>
   </details>

## Part II: Formula Application & Short Answer
Create 3 Short Answer Questions based on the formulas provided.
- Present the question clearly.
- Define a scenario where the student must use one of the provided formulas.
- Hide the step-by-step solution using a `<details><summary>Reveal Solution</summary>` block.

**1. A particle’s position is given by the function *s(t) = 3t<sup>2</sup> + 2t*, where *s* is measured in meters and *t* in seconds.  Calculate the velocity of the particle at *t = 1* second.**

   <details><summary>Reveal Solution</summary>
   <p><b>Formula Used:</b>  Velocity is the derivative of position with respect to time:  *v(t) = s'(t)*</p>
   <p>1.  Find the derivative of *s(t)*:  *s'(t) = d/dt (3t<sup>2</sup> + 2t) = 6t + 2*</p>
   <p>2.  Evaluate *s'(t)* at *t = 1*:  *v(1) = 6(1) + 2 = 8*</p>
   <p><b>Answer:</b> The velocity of the particle at *t = 1* second is 8 m/s.</p>
   </details>

**2. Suppose *f(x) = x<sup>3</sup> - 6x<sup>2</sup> + 9x + 2*.  Determine the instantaneous rate of change of *f(x)* at *x = 2*.**

   <details><summary>Reveal Solution</summary>
   <p><b>Formula Used:</b> The derivative of a function *f(x)* at a point *x = a* is *f'(a)*.</p>
   <p>1. Find the derivative of *f(x)*: *f'(x) = 3x<sup>2</sup> - 12x + 9*</p>
   <p>2. Evaluate *f'(x)* at *x = 2*: *f'(2) = 3(2)<sup>2</sup> - 12(2) + 9 = 12 - 24 + 9 = -3*</p>
   <p><b>Answer:</b> The instantaneous rate of change of *f(x)* at *x = 2* is -3.</p>
   </details>

**3. Given the function *f(x) = x<sup>2</sup> + 4x*, find the equation of the tangent line to the curve at the point where *x = 1*.**

   <details><summary>Reveal Solution</summary>
   <p><b>Formula Used:</b>  The derivative *f'(x)* represents the slope of the tangent line at any point *x*. The point-slope form of a line is *y - y<sub>1</sub> = m(x - x<sub>1</sub>)*, where *m* is the slope and (*x<sub>1</sub>*, *y<sub>1</sub>*) is a point on the line.</p>
   <p>1. Find the derivative of *f(x)*: *f'(x) = 2x + 4*</p>
   <p>2. Evaluate *f'(x)* at *x = 1*: *f'(1) = 2(1) + 4 = 6*  (This is the slope, *m*).</p>
   <p>3. Find the y-coordinate of the point on the curve at *x = 1*: *f(1) = (1)<sup>2</sup> + 4(1) = 5* (This is *y<sub>1</sub>*).</p>
   <p>4.  Use the point-slope form with (*x<sub>1</sub>*, *y<sub>1</sub>*) = (1, 5) and *m* = 6: *y - 5 = 6(x - 1)*</p>
   <p><b>Answer:</b> The equation of the tangent line is *y = 6x - 1*. </p>
   </details>
