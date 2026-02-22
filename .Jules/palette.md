## 2025-05-15 - [WPF Accessibility Blind Spots]
**Learning:** In WPF, ComboBoxes and other form controls placed next to TextBlocks are not automatically associated for screen readers. Unlike HTML's `<label for="...">`, WPF requires explicit `AutomationProperties.Name` (or `LabeledBy`) to ensure accessibility.
**Action:** When auditing WPF XAML, always check if form controls have accessible names, especially when using simple `TextBlock` for visual labels.

## 2025-05-15 - [Keyboard Shortcut Discovery]
**Learning:** Users often don't know keyboard shortcuts exist unless they are surfaced in the UI. Adding shortcut hints to tooltips (e.g., "Start (Space)") is a low-effort, high-impact way to teach power user features without cluttering the interface.
**Action:** When defining keyboard shortcuts in code-behind, ensure the corresponding UI controls display these shortcuts in their ToolTips or labels.
