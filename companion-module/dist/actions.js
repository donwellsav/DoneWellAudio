export function UpdateActions(self) {
    self.setActionDefinitions({
        acknowledge_latest: {
            name: 'Acknowledge Latest Advisory',
            options: [],
            callback: async () => {
                self.acknowledgeLatest();
            },
        },
        acknowledge_all: {
            name: 'Acknowledge All Advisories',
            options: [],
            callback: async () => {
                self.acknowledgeAll();
            },
        },
        clear_all: {
            name: 'Clear All Advisories',
            options: [],
            callback: async () => {
                self.clearAll();
            },
        },
        apply_latest: {
            name: 'Apply Latest EQ to Mixer',
            options: [],
            callback: async () => {
                self.applyLatest();
            },
        },
    });
}
//# sourceMappingURL=actions.js.map