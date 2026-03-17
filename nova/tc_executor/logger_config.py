import logging, os

# Configure logger
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

# Create handler (console)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)

# Create file handler (logs only ERROR and CRITICAL messages)
debug_filepath = os.path.join(os.getcwd(), 'debug.log')
file_handler = logging.FileHandler(debug_filepath, mode="w")
file_handler.setLevel(logging.DEBUG)  # Logs only ERROR and CRITICAL messages to file

# Create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
file_handler.setFormatter(formatter)

# Add handler to logger (only if not already added)
if not logger.hasHandlers():
    logger.addHandler(console_handler)
    logger.addHandler(file_handler) 

"""
logger.debug ("")
logger.info ("")
logger.warning ("")
logger.error ("")
logger.critical ("")
"""
