# 🎓 Giải tích hàm nhiều biến số (Giải tích 2) Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check

- **1. What is the primary distinction between partial derivatives and regular derivatives in multivariable calculus?**
   > A.  Regular derivatives measure instantaneous rate of change with respect to a single variable, while partial derivatives measure instantaneous rate of change with respect to one specific variable, holding other variables constant.
   > B.  Partial derivatives are always zero, while regular derivatives are always non-zero.
   > C.  Partial derivatives apply only to functions of a single variable, whereas regular derivatives apply to functions of multiple variables.
   > D.  Regular derivatives represent slopes of tangent lines, while partial derivatives represent projections of tangent lines onto coordinate planes.

<details>
  <summary>Reveal Answer</summary>
  A. Regular derivatives measure instantaneous rate of change with respect to a single variable, while partial derivatives measure instantaneous rate of change with respect to one specific variable, holding other variables constant.
</details>


- **2.  The gradient of a scalar function f(x, y) is defined as:**
   > A.  ∂f/∂x, ∂f/∂y
   > B.  ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)
   > C.  ∇f = (∂f/∂x, ∂f/∂y)
   > D.  f(x+h, y+k) - f(x, y)

<details>
  <summary>Reveal Answer</summary>
  C. ∇f = (∂f/∂x, ∂f/∂y)
</details>


- **3. What does the Divergence Theorem (Gauss's Theorem) state in its basic form?**
   > A.  ∫∫_S (∇ ⋅ F) ⋅ n dS = ∫_C F ⋅ n ds
   > B.  ∫∫_V (∇ ⋅ F) dV = ∮_S F ⋅ n dS
   > C.  ∫∫_S F ⋅ n dS = ∫_C F ⋅ n ds
   > D.  ∇ ⋅ F = 0

<details>
  <summary>Reveal Answer</summary>
  B. ∫∫_V (∇ ⋅ F) dV = ∮_S F ⋅ n dS
</details>


- **4.  What is the meaning of the term "level surface" for a scalar function f(x, y, z)?**
   > A.  A curve in 3D space where the gradient of f is zero.
   > B.  A surface in 3D space where the function f has a constant value.
   > C.  A line in 3D space where the partial derivatives of f are equal.
   > D.  The set of all points where f(x, y, z) is maximized.

<details>
  <summary>Reveal Answer</summary>
  B. A surface in 3D space where the function f has a constant value.
</details>


- **5.  Which of the following represents the chain rule for a function of multiple variables?**
   > A.  (∂f/∂x) = (∂f/∂y) * (∂y/∂x)
   > B.  (∂f/∂x) = (∂f/∂y) * (∂y/∂x) * (∂z/∂x)
   > C.  (∂f/∂x) = (∂f/∂y)
   > D.  ∂f/∂x = (∂f/∂y) * (∂y/∂x)

<details>
  <summary>Reveal Answer</summary>
  B. (∂f/∂x) = (∂f/∂y) * (∂y/∂x) * (∂z/∂x)
</details>

## Part II: Formula Application & Short Answer

- **1. Scenario:**  Let f(x, y) = x<sup>2</sup> + y<sup>2</sup>.  Calculate ∂f/∂x and ∂f/∂y.  Explain briefly how these partial derivatives relate to the shape of the level surface of f.

<details>
  <summary>Reveal Solution</summary>
  ∂f/∂x = 2x
  ∂f/∂y = 2y
  The partial derivatives represent the slopes of the tangent lines to the level surface at a given point.  For f(x,y) = x<sup>2</sup> + y<sup>2</sup>, the level surfaces are circular cylinders. The gradient at a point will point in the direction of the steepest ascent of the function.
</details>


- **2. Scenario:**  Consider the vector field F(x, y) = <y, x>.  Calculate ∇ ⋅ F.  What does this result indicate about the field?

<details>
  <summary>Reveal Solution</summary>
  ∇ ⋅ F = ∂F<sub>x</sub>/∂x + ∂F<sub>y</sub>/∂y = 0 + 1 = 1
  This result indicates that the vector field is incompressible, meaning its divergence is non-zero.  This generally implies a source or sink of the vector field.
</details>


- **3. Scenario:**  Use the Divergence Theorem to evaluate the flux of the vector field F(x, y, z) = <x, y, z> across the unit cube defined by 0 ≤ x ≤ 1, 0 ≤ y ≤ 1, 0 ≤ z ≤ 1.

<details>
  <summary>Reveal Solution</summary>
  The Divergence Theorem states:  ∮_S F ⋅ n dS = ∫∫∫_V (∇ ⋅ F) dV
  Here, ∇ ⋅ F = x + y + z.
  ∫∫∫_V (x + y + z) dV = ∫<sub>0</sub><sup>1</sup> ∫<sub>0</sub><sup>1</sup> ∫<sub>0</sub><sup>1</sup> (x + y + z) dz dy dx
  = ∫<sub>0</sub><sup>1</sup> ∫<sub>0</sub><sup>1</sup> [xz + yz + z<sup>2</sup>/2]<sub>z=0</sub><sup>z=1</sup> dy dx
  = ∫<sub>0</sub><sup>1</sup> ∫<sub>0</sub><sup>1</sup> (x + y + 1/2) dy dx
  = ∫<sub>0</sub><sup>1</sup> [xy + y<sup>2</sup>/2 + y]<sub>y=0</sub><sup>y=1</sup> dx
  = ∫<sub>0</sub><sup>1</sup> (x + 1/2 + 1) dx
  = ∫<sub>0</sub><sup>1</sup> (x + 3/2) dx
  = [x<sup>2</sup>/2 + 3x/2]<sub>0</sub><sup>1</sup>
  = 1/2 + 3/2 = 2
</details>
