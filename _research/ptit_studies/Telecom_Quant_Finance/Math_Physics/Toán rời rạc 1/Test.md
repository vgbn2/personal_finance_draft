# 🎓 Toán rời rạc 1 Mastery Assessment

> *Test your knowledge based on the core required reading materials.*

## Part I: Multiple Choice Concept Check

- **1. What is the primary focus of Discrete Mathematics?**
    A.  Continuous mathematical modeling
    B.  The study of complex, non-discrete systems
    C.  The study and processing of discrete objects.
    D.  Calculus and differential equations

    <details><summary>Reveal Answer</summary>
    <p>C. The study and processing of discrete objects.</p>
    <p>Discrete mathematics deals with objects that can only take on distinct, separate values, as opposed to continuous values. This definition accurately captures the essence of the field.</p>
    </details>

- **2. If a statement 'p' is false, what is the value of the negation of 'p' ( p)?**
    A.  T (True)
    B.  F (False)
    C.  Undefined
    D.  Dependent on the context

    <details><summary>Reveal Answer</summary>
    <p>B. F (False)</p>
    <p>By definition, the negation of a statement 'p' is true when 'p' is false, and false when 'p' is true.  Therefore, if 'p' is false, then p must be false.</p>
    </details>

- **3. The statement 'p  q' is true when:**
    A.  Both 'p' and 'q' are true.
    B.  Both 'p' and 'q' are false.
    C.  One of 'p' or 'q' is true and the other is false.
    D.  'p' and 'q' are logically equivalent.

    <details><summary>Reveal Answer</summary>
    <p>C. One of 'p' or 'q' is true and the other is false.</p>
    <p>The exclusive or () is true when exactly one of the operands is true.  If both are true or both are false, the statement is false.</p>
    </details>

- **4.  What condition makes the conditional statement 'p  q' true?**
    A.  'p' is true and 'q' is true.
    B.  'p' is false and 'q' is true.
    C.  'p' is true and 'q' is false.
    D.  'p' is false and 'q' is false.

    <details><summary>Reveal Answer</summary>
    <p>C. 'p' is true and 'q' is false.</p>
    <p>The conditional 'p  q' is true whenever 'p' is true, regardless of the truth value of 'q'.  It is only false when 'p' is true and 'q' is false.</p>
    </details>

- **5. Which of the following best describes "Tương đương logic"?**
    A. A statement that is always true.
    B. A statement that is always false.
    C. A logical statement that has the same truth value as another logical statement.
    D. A statement that can be simplified to a simpler form.

    <details><summary>Reveal Answer</summary>
    <p>C. A logical statement that has the same truth value as another logical statement.</p>
    <p>Tương đương logic refers to logical equivalence – two formulas that evaluate to true in the same circumstances.</p>
    </details>

## Part II: Formula Application & Short Answer

- **1. Scenario:** A company wants to determine if a new marketing campaign is effective. Let 'p' be the statement "The campaign increased website traffic" and 'q' be the statement "The campaign increased sales."  Formulate the conditional statement 'p  q' in terms of the company's objective.  Explain what this statement implies.

    <details><summary>Reveal Solution</summary>
    <p><b>Formula:</b> p  q</p>
    <p><b>Scenario:</b> p  q means "If the campaign increased website traffic, then the campaign increased sales."</p>
    <p><b>Implication:</b> This statement implies that increased website traffic is a necessary condition for increased sales due to the campaign. It doesn't mean that increased website traffic *always* leads to increased sales – there could be other factors involved.  It's a causal relationship based on the assumption the campaign increased website traffic.</p>
    </details>

- **2.  Given the formula N(A ∪ B) = N(A) + N(B) - N(A ∩ B), explain how this formula can be used to calculate the number of elements in the union of two sets, A and B.**

    <details><summary>Reveal Solution</summary>
    <p><b>Formula:</b> N(A ∪ B) = N(A) + N(B) - N(A ∩ B)</p>
    <p><b>Explanation:</b> This formula calculates the number of elements in the union of two sets by adding the number of elements in each set (N(A) and N(B)) and then subtracting the number of elements that are common to both sets (N(A ∩ B)).  This avoids double-counting the elements that are in both sets.</p>
    </details>

- **3.  A software company is developing a new operating system.  Let 'p' represent the statement "The operating system supports 32-bit architecture" and 'q' represent the statement "The operating system supports 64-bit architecture."  Using the formula N(A  B) = N(A) N(B) ,  explain how this formula can be used to determine the number of possible combinations of architecture support for the operating system.**

     <details><summary>Reveal Solution</summary>
     <p><b>Formula:</b> N(A  B) = N(A) N(B)</p>
     <p><b>Explanation:</b> This formula calculates the number of possible combinations of architecture support. The operating system can either support 32-bit or 64-bit architecture (2 possibilities).  Multiplying the number of possibilities for each architecture (2 * 2 = 4) gives the total number of combinations. These combinations are: 32-32, 32-64, 64-32, and 64-64.</p>
     </details>
