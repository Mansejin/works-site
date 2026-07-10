FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY server.py .

ENV WORKS_HOST=0.0.0.0
ENV WORKS_PORT=8788

EXPOSE 8788

CMD ["python", "server.py"]
