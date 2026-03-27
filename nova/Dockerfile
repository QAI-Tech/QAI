FROM python:3.12-slim

WORKDIR /app

# Copy nova source
COPY ./nova/ /app/
# Copy orionis/src so nova's runtime imports resolve
COPY ./orionis/src /orionis-src

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -e ./droidrun[google]

CMD ["python", "listener_web.py"]