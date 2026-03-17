#!/usr/bin/env python3
"""
Test script for Graph Saving API

This script tests the Graph API endpoints to ensure they're working correctly.
Run this script after starting the server to verify the implementation.
"""

import requests
import json
import sys
from datetime import datetime

# Server configuration
BASE_URL = "http://localhost:8001"
API_BASE = f"{BASE_URL}/api/graph"

# Sample test data
SAMPLE_PRODUCT_ID = "test-product-123"

SAMPLE_GRAPH_DATA = {
    "nodes": [
        {
            "id": "node-1",
            "type": "customNode",
            "position": {"x": 100, "y": 100},
            "data": {
                "description": "Test Node 1",
                "image": "test-image.png"
            }
        },
        {
            "id": "node-2", 
            "type": "customNode",
            "position": {"x": 300, "y": 200},
            "data": {
                "description": "Test Node 2",
                "image": "test-image-2.png"
            }
        }
    ],
    "edges": [
        {
            "id": "edge-1",
            "source": "node-1",
            "target": "node-2",
            "type": "customEdge",
            "data": {
                "description": "Test Edge",
                "paramValues": ["param1", "param2"]
            }
        }
    ]
}

SAMPLE_FEATURES_DATA = {
    "features": [
        {
            "id": "feature-1",
            "name": "Test Feature",
            "nodeIds": ["node-1", "node-2"],
            "isCollapsed": False
        }
    ],
    "exportedAt": datetime.utcnow().isoformat()
}

SAMPLE_FLOWS_DATA = {
    "flows": [
        {
            "id": "flow-1",
            "name": "Test Flow",
            "startNodeId": "node-1",
            "endNodeId": "node-2",
            "viaNodeIds": [],
            "pathNodeIds": ["node-1", "node-2"]
        }
    ]
}

SAMPLE_COMMENTS_DATA = {
    "comments": [
        {
            "id": "comment-1",
            "content": "Test Comment",
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat(),
            "position": {"x": 200, "y": 150}
        }
    ],
    "exportedAt": datetime.utcnow().isoformat()
}


def test_bucket_info():
    """Test bucket info endpoint"""
    print("Testing bucket info...")
    try:
        response = requests.get(f"{API_BASE}/bucket-info")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Bucket info: {data}")
            return True
        else:
            print(f"❌ Bucket info failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Bucket info error: {e}")
        return False


def test_save_complete_graph():
    """Test saving complete graph data"""
    print("Testing save complete graph...")
    try:
        payload = {
            "product_id": SAMPLE_PRODUCT_ID,
            "graph_data": SAMPLE_GRAPH_DATA,
            "features_data": SAMPLE_FEATURES_DATA,
            "flows_data": SAMPLE_FLOWS_DATA,
            "comments_data": SAMPLE_COMMENTS_DATA
        }
        
        response = requests.post(
            f"{API_BASE}/save",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Save complete graph: {data}")
            return True
        else:
            print(f"❌ Save complete graph failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Save complete graph error: {e}")
        return False


def test_load_complete_graph():
    """Test loading complete graph data"""
    print("Testing load complete graph...")
    try:
        response = requests.get(f"{API_BASE}/load/{SAMPLE_PRODUCT_ID}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Load complete graph: Success")
            print(f"   Nodes: {len(data['data']['graph_data']['nodes'])}")
            print(f"   Edges: {len(data['data']['graph_data']['edges'])}")
            print(f"   Features: {len(data['data']['features_data']['features'])}")
            print(f"   Flows: {len(data['data']['flows_data']['flows'])}")
            print(f"   Comments: {len(data['data']['comments_data']['comments'])}")
            return True
        else:
            print(f"❌ Load complete graph failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Load complete graph error: {e}")
        return False


def test_individual_save_load():
    """Test individual save and load endpoints"""
    print("Testing individual save/load endpoints...")
    
    # Test nodes-edges
    print("  Testing nodes-edges...")
    try:
        # Save
        payload = {
            "product_id": SAMPLE_PRODUCT_ID,
            "nodes": SAMPLE_GRAPH_DATA["nodes"],
            "edges": SAMPLE_GRAPH_DATA["edges"]
        }
        response = requests.post(f"{API_BASE}/save-nodes-edges", json=payload)
        if response.status_code != 200:
            print(f"❌ Save nodes-edges failed: {response.status_code}")
            return False
        
        # Load
        response = requests.get(f"{API_BASE}/load-nodes-edges/{SAMPLE_PRODUCT_ID}")
        if response.status_code != 200:
            print(f"❌ Load nodes-edges failed: {response.status_code}")
            return False
        print("  ✅ Nodes-edges save/load successful")
    except Exception as e:
        print(f"❌ Nodes-edges test error: {e}")
        return False
    
    # Test features
    print("  Testing features...")
    try:
        payload = {
            "product_id": SAMPLE_PRODUCT_ID,
            "features": SAMPLE_FEATURES_DATA["features"],
            "exportedAt": SAMPLE_FEATURES_DATA["exportedAt"]
        }
        response = requests.post(f"{API_BASE}/save-features", json=payload)
        if response.status_code != 200:
            print(f"❌ Save features failed: {response.status_code}")
            return False
        
        response = requests.get(f"{API_BASE}/load-features/{SAMPLE_PRODUCT_ID}")
        if response.status_code != 200:
            print(f"❌ Load features failed: {response.status_code}")
            return False
        print("  ✅ Features save/load successful")
    except Exception as e:
        print(f"❌ Features test error: {e}")
        return False
    
    return True


def test_generate_signed_url():
    """Test signed URL generation"""
    print("Testing signed URL generation...")
    try:
        payload = {
            "product_id": SAMPLE_PRODUCT_ID,
            "data_type": "graph",
            "expiration_minutes": 15
        }
        
        response = requests.post(
            f"{API_BASE}/generate-upload-url",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Signed URL generated: {data['file_path']}")
            print(f"   Expires in: {data['expires_in_minutes']} minutes")
            return True
        else:
            print(f"❌ Generate signed URL failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Generate signed URL error: {e}")
        return False


def main():
    """Run all tests"""
    print("🚀 Starting Graph API Tests")
    print("="*50)
    
    tests = [
        test_bucket_info,
        test_save_complete_graph,
        test_load_complete_graph,
        test_individual_save_load,
        test_generate_signed_url,
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            print("-" * 30)
        except Exception as e:
            print(f"❌ Test {test.__name__} crashed: {e}")
            print("-" * 30)
    
    print("="*50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed!")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Check the logs above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
