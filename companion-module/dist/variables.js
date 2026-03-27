export function UpdateVariableDefinitions(self) {
    self.setVariableDefinitions([
        // PEQ recommendation
        { variableId: 'peq_frequency', name: 'PEQ Frequency (Hz)' },
        { variableId: 'peq_q', name: 'PEQ Q Factor' },
        { variableId: 'peq_gain', name: 'PEQ Gain (dB)' },
        { variableId: 'peq_type', name: 'PEQ Filter Type' },
        // GEQ recommendation
        { variableId: 'geq_band', name: 'GEQ Band Center (Hz)' },
        { variableId: 'geq_band_index', name: 'GEQ Fader Index (0-30)' },
        { variableId: 'geq_gain', name: 'GEQ Suggested Gain (dB)' },
        // Pitch & detection
        { variableId: 'note', name: 'Musical Pitch' },
        { variableId: 'severity', name: 'Detection Severity' },
        { variableId: 'confidence', name: 'Detection Confidence' },
        // State
        { variableId: 'pending_count', name: 'Pending Advisory Count' },
        { variableId: 'last_updated', name: 'Last Advisory Timestamp' },
    ]);
}
//# sourceMappingURL=variables.js.map