class State:
    def __init__(self, tc, tc_id, mode, executor_response, verifier_response):
        self.test_case = tc
        self.test_case_id = tc_id
        self.mode = mode
        self.executor_response = executor_response
        self.verifier_response = verifier_response
"""
executor_response: 
{
    "before_ss": before_ss,
    "after_ss": after_ss,
    "response": response,
    "atomic_steps": atomic_steps
}

verifier_response:
{
    'status':status, 
    'rationale':rationale
}
"""

class Mode:
    def __init__(self):
        self.all_modes = ['normal', 'template', 'cache', 'backtracking', 'remember', 'buffer']
        self.mode = 'normal'
    def normalModeOn(self):
        self.mode = 'normal'
    def backtrackingModeOn(self):
        self.mode = 'backtracking'
    def templateModeOn(self):
        self.mode = 'template'
    def cacheModeOn(self):
        self.mode = 'cache'
    def rememberModeOn(self):
        self.mode = 'remember'
    def bufferStateModeOn(self):
        self.mode = 'buffer'
    
    def getCurrMode(self):
        return self.mode

    def isNormalMode(self):
        return (self.mode == 'normal')
    def isBacktrackingMode(self):
        return (self.mode == 'backtracking')
    def isTemplateMode(self):
        return (self.mode == 'template')
    def isCacheMode(self):
        return (self.mode == 'cache')
    def isRememberMode(self):
        return (self.mode == 'remember')
    def isBufferStateMode(self):
        return (self.mode == 'buffer')
