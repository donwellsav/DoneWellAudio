## 2025-05-15 - [WPF Accessibility Blind Spots]
**Learning:** In WPF, ComboBoxes and other form controls placed next to TextBlocks are not automatically associated for screen readers. Unlike HTML's `<label for="...">`, WPF requires explicit `AutomationProperties.Name` (or `LabeledBy`) to ensure accessibility.
**Action:** When auditing WPF XAML, always check if form controls have accessible names, especially when using simple `TextBlock` for visual labels.
