import json, sys, os
""" -------------------------------------------- Faircado -------------------------------------------"""

EXPECTED_APP_BEHAVIOUR = """
1. If there is a heart icon filled with red color then it means that the item has been liked and will be saved to the favourites.
2. If you apply a filter then it is okay even if the items listed are not from the applied filter.
"""

WHEN_TO_USE_WHICH_UI_ELEMENT = """
Searching:
    1. If you click on the search icon below then it will show the categories - men, women, electronics. hence if your next todo step is choosing one of the category then click on search icon rather than clicking on search bar.
    2. If there is a user interaction about search then do consider the next user interaction - whether it it is about on of the category, then always select a step about - clicking search icon located on the navigation bar. 
"""

dt = {'https://play.google.com/store/apps/details?id=com.faircado&hl=en_IN':
      {'EXPECTED_APP_BEHAVIOUR': EXPECTED_APP_BEHAVIOUR,
       'WHEN_TO_USE_WHICH_UI_ELEMENT': WHEN_TO_USE_WHICH_UI_ELEMENT}
      }

with open('app_details.json', 'w') as outfileobj:
    json.dump(dt, outfileobj, indent=2)
