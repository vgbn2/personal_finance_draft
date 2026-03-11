---
## CSS Specificity and Inheritance
- **Category:** Front-End
- **Core Concept:** This document explores CSS specificity, the mechanism that determines which CSS rules apply to an element when multiple rules conflict. It covers key factors like selector types, combinators, and the importance of rule order. Furthermore, it explains CSS inheritance, detailing which properties are inherited and how direct targeting overrides inheritance.
- **Technical Breakdown:**
  - Specificity determines the order in which CSS rules are applied when conflicts arise.
  - Combinators (like ID, class, and descendant selectors) contribute to specificity.
  - Inheritance allows certain CSS properties to be automatically applied to descendant elements.
- **Snippet:**
```css
/* rule 1 */
.class.second-class { 
  font-size: 12px; 
} 

/* rule 2 */
.class .second-class { 
  font-size: 24px; 
} 

/* rule 1 */
.class.second-class { 
  font-size: 12px; 
} 

/* rule 2 */
.class > .second-class { 
  font-size: 24px; 
} 

/* rule 1 */
* { 
  color: black; 
} 

/* rule 2 */
h1 { 
  color: orange; 
} 

/* rule 1 */
#parent { 
  color: red; 
} 

/* rule 2 */
.child { 
  color: blue; 
} 

/* styles.css */

.alert { 
  color: red; 
} 

.warning { 
  color: yellow; 
}
```
- **Cross-Reference:** CSS Selectors, CSS Inheritance, Cascading Style Sheets (CSS) Algorithm
---

_Source: C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\llm_feeder\data\odin\foundations\the_cascade.md (chunk 1)_
