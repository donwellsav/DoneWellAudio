import { combineRgb } from '@companion-module/base';
export function UpdatePresets(self) {
    const presets = {
        latest_advisory: {
            type: 'button',
            category: 'DoneWell Audio',
            name: 'Latest Advisory',
            style: {
                text: '$(donewell:peq_frequency)Hz\\n$(donewell:peq_gain)dB Q$(donewell:peq_q)',
                size: 'auto',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(40, 40, 40),
            },
            steps: [
                {
                    down: [{ actionId: 'acknowledge_latest', options: {} }],
                    up: [],
                },
            ],
            feedbacks: [
                { feedbackId: 'advisory_pending', options: {} },
                { feedbackId: 'severity_runaway', options: {} },
            ],
        },
        clear_all: {
            type: 'button',
            category: 'DoneWell Audio',
            name: 'Clear All',
            style: {
                text: 'CLEAR\\nALL',
                size: 'auto',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(80, 0, 0),
            },
            steps: [
                {
                    down: [{ actionId: 'clear_all', options: {} }],
                    up: [],
                },
            ],
            feedbacks: [],
        },
        status: {
            type: 'button',
            category: 'DoneWell Audio',
            name: 'Status',
            style: {
                text: 'DWA\\n$(donewell:pending_count) pending\\n$(donewell:severity)',
                size: 'auto',
                color: combineRgb(255, 255, 255),
                bgcolor: combineRgb(0, 60, 0),
            },
            steps: [],
            feedbacks: [{ feedbackId: 'advisory_pending', options: {} }],
        },
    };
    self.setPresetDefinitions(presets);
}
//# sourceMappingURL=presets.js.map