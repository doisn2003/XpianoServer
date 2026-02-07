$body = @{
    name = "Test Piano"
    image_url = "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0"
    category = "Digital"
    price_per_hour = 150000
    rating = 4.5
    reviews_count = 10
    description = "Test description"
    features = @("Feature 1", "Feature 2")
} | ConvertTo-Json

Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/api/pianos -Method POST -Body $body -ContentType "application/json" | Select-Object -ExpandProperty Content
