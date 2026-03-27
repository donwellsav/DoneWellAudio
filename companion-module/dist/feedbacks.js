import { combineRgb } from '@companion-module/base';
export function UpdateFeedbacks(self) {
    self.setFeedbackDefinitions({
        advisory_pending: {
            name: 'Advisory Pending',
            type: 'boolean',
            defaultStyle: {
                bgcolor: combineRgb(180, 130, 0),
                color: combineRgb(255, 255, 255),
            },
            options: [],
            callback: () => {
                return self.pendingAdvisories.length > 0;
            },
        },
        severity_runaway: {
            name: 'Severity is Runaway',
            type: 'boolean',
            defaultStyle: {
                bgcolor: combineRgb(200, 0, 0),
                color: combineRgb(255, 255, 255),
            },
            options: [],
            callback: () => {
                const latest = self.pendingAdvisories[self.pendingAdvisories.length - 1];
                return latest?.severity === 'RUNAWAY';
            },
        },
        severity_growing: {
            name: 'Severity is Growing',
            type: 'boolean',
            defaultStyle: {
                bgcolor: combineRgb(200, 100, 0),
                color: combineRgb(255, 255, 255),
            },
            options: [],
            callback: () => {
                const latest = self.pendingAdvisories[self.pendingAdvisories.length - 1];
                return latest?.severity === 'GROWING';
            },
        },
    });
}
//# sourceMappingURL=feedbacks.js.map