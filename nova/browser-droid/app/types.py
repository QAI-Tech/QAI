from enum import Enum


class InteractionType(Enum):
    """Enum for different types of user interactions"""

    TAP = "tap"
    SWIPE = "swipe"
    INPUT = "input"
    BACK = "back"
    HOME = "home"
    VOLUME_UP = "volume_up"
    VOLUME_DOWN = "volume_down"
