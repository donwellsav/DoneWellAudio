import { MIXER_MODEL_CHOICES } from './mixerProfiles.js';
export function GetConfigFields() {
    return [
        // ── Input ──
        {
            type: 'static-text',
            id: 'input_header',
            label: '',
            value: '── Input: Relay Connection ──',
            width: 12,
        },
        {
            type: 'textinput',
            id: 'pairingCode',
            label: 'Pairing Code',
            default: '',
            width: 6,
        },
        {
            type: 'textinput',
            id: 'siteUrl',
            label: 'Site URL',
            default: '',
            width: 6,
        },
        {
            type: 'number',
            id: 'pollIntervalMs',
            label: 'Poll Interval (ms)',
            default: 500,
            min: 200,
            max: 5000,
            step: 100,
            width: 6,
        },
        // ── Output ──
        {
            type: 'static-text',
            id: 'output_header',
            label: '',
            value: '── Output: Mixer Connection ──',
            width: 12,
        },
        {
            type: 'dropdown',
            id: 'mixerModel',
            label: 'Mixer Model',
            default: 'x32',
            choices: [
                { id: 'none', label: 'None (variables only)' },
                ...MIXER_MODEL_CHOICES,
            ],
            width: 6,
        },
        {
            type: 'textinput',
            id: 'mixerHost',
            label: 'Mixer IP Address',
            default: '',
            width: 6,
        },
        {
            type: 'number',
            id: 'mixerPort',
            label: 'Mixer Port (auto-set by model, override here)',
            default: 10023,
            min: 1,
            max: 65535,
            width: 6,
        },
        {
            type: 'textinput',
            id: 'oscPrefix',
            label: 'Channel/EQ Prefix (e.g. /ch/01/eq)',
            default: '/ch/01/eq',
            width: 6,
        },
        {
            type: 'textinput',
            id: 'geqPrefix',
            label: 'GEQ Channel/Chain Prefix (blank = same as PEQ)',
            default: '',
            width: 6,
        },
        {
            type: 'number',
            id: 'peqBandCount',
            label: 'PEQ Bands Available (for slot management)',
            default: 6,
            min: 1,
            max: 8,
            width: 6,
        },
        {
            type: 'number',
            id: 'peqBandStart',
            label: 'First PEQ Band Number',
            default: 1,
            min: 1,
            max: 8,
            width: 6,
        },
        {
            type: 'dropdown',
            id: 'outputMode',
            label: 'EQ Output Mode',
            default: 'peq',
            choices: [
                { id: 'peq', label: 'PEQ (parametric notches)' },
                { id: 'geq', label: 'GEQ (graphic EQ bands)' },
                { id: 'both', label: 'Both PEQ + GEQ' },
            ],
            width: 6,
        },
        {
            type: 'checkbox',
            id: 'autoApply',
            label: 'Auto-Apply EQ on advisory receive',
            default: false,
            width: 6,
        },
        {
            type: 'number',
            id: 'maxCutDb',
            label: 'Max Cut Depth (dB)',
            default: -12,
            min: -24,
            max: -3,
            step: 1,
            width: 6,
        },
        // ── DWA-Owned Bands ──
        {
            type: 'static-text',
            id: 'bands_header',
            label: '',
            value: '── DWA-Owned Bands ──\n' +
                'DWA manages PEQ bands starting at "First PEQ Band Number" for "PEQ Bands Available" slots. ' +
                'Dedicate these bands to DWA — keep your own EQ on other bands.\n' +
                'GEQ bands are zeroed when advisories clear. Use PEQ-only mode if you have manual GEQ tuning to preserve.',
            width: 12,
        },
    ];
}
//# sourceMappingURL=config.js.map