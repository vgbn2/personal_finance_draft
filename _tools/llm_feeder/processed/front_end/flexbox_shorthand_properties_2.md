---
## Flexbox Shorthand Properties
- **Category:** Front-End
- **Core Concept:** The `flex` shorthand property in CSS defines three key flexbox properties simultaneously: `flex-grow`, `flex-shrink`, and `flex-basis`. These properties control how a flex item grows or shrinks relative to its parent container and its intrinsic size. Understanding these values is crucial for creating responsive and adaptable layouts using flexbox.
- **Technical Breakdown:**
  - `flex-grow`: Determines how much a flex item will grow relative to other flex items in the same container when there is extra space.
  - `flex-shrink`: Determines how much a flex item will shrink relative to other flex items in the same container when there isn't enough space.
  - `flex-basis`: Sets the initial size of a flex item before any growth or shrinkage is applied. It's often used with values like `auto`, `content`, or a specific length.
- **Snippet:**
```css
.flex-container {
  display: flex;
  flex: 1 1 auto;
}
```
- **Cross-Reference:** Flexbox, CSS Display Property, Container Size, Flex-Basis
---

_Source: C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\llm_feeder\data\odin\foundations\flexbox_growing_and_shrinking.md (chunk 2)_
