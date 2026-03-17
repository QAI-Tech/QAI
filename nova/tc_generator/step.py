class Step:
    def __init__(self, test_case_description, step_description):
        self.test_case_description = test_case_description
        self.step_description = step_description
        self.preconditions = []
        self.expected_results = []
