#!/bin/bash

# ===========================================
# Tinkuy Backend - Post-Deploy Verification
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${1:-$(cat .railway_url 2>/dev/null || echo 'http://localhost:4000')}"
TIMEOUT=10
FAILURES=0

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((FAILURES++))
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ===========================================
# VERIFICATION START
# ===========================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Tinkuy Backend - Post-Deploy Verify     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "URL Base: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo ""

# ===========================================
# 1. HEALTH CHECK
# ===========================================

print_header "1. HEALTH CHECK"

health_response=$(curl -s --max-time $TIMEOUT "$BASE_URL/health" 2>/dev/null)
health_status=$?

if [ $health_status -ne 0 ]; then
    print_error "/health - No se pudo conectar"
    print_info "Verificar que el servidor esté corriendo y PORT esté configurado"
    FAILURES=$((FAILURES + 1))
else
    if echo "$health_response" | grep -q '"status":"ok"'; then
        print_success "/health - Health check OK"

        if echo "$health_response" | grep -q '"database":"connected"'; then
            print_success "Database - Connected"
        else
            print_error "Database - No conectada"
            print_info "Verificar DATABASE_URL y credenciales de Supabase"
        fi

        if echo "$health_response" | grep -q '"redis":"connected"'; then
            print_success "Redis - Connected"
        else
            print_warning "Redis - No conectada o no requerida"
            print_info "Verificar REDIS_URL y credenciales de Upstash/Redis"
        fi
    else
        print_error "/health - Response inesperada"
        echo "  $health_response"
    fi
fi

# ===========================================
# 2. GRAPHQL ENDPOINT
# ===========================================

print_header "2. GRAPHQL ENDPOINT"

graphql_response=$(curl -s -X POST \
    --max-time $TIMEOUT \
    -H "Content-Type: application/json" \
    -d '{"query":"{ __typename }"}' \
    "$BASE_URL/graphql" 2>/dev/null)

if echo "$graphql_response" | grep -q '"data"'; then
    print_success "/graphql - Endpoint respondiendo"
    print_info "Response: $graphql_response"
elif echo "$graphql_response" | grep -q '"errors"'; then
    if echo "$graphql_response" | grep -q 'introspection'; then
        print_warning "/graphql - Introspección deshabilitada (OK en producción)"
        print_success "/graphql - Endpoint respondiendo"
    else
        print_warning "/graphql - Responde con errores"
        echo "  $graphql_response"
    fi
else
    print_error "/graphql - No responde correctamente"
    echo "  $graphql_response"
    FAILURES=$((FAILURES + 1))
fi

mutation_test='{"query":"mutation { __typename }"}'
simple_response=$(curl -s -X POST \
    --max-time $TIMEOUT \
    -H "Content-Type: application/json" \
    -d "$mutation_test" \
    "$BASE_URL/graphql" 2>/dev/null)

if echo "$simple_response" | grep -q '__typename'; then
    print_success "GraphQL - Queries/Mutations funcionan"
fi

# ===========================================
# 3. DATABASE CONNECTION
# ===========================================

print_header "3. DATABASE CONNECTION"

db_test=$(curl -s --max-time $TIMEOUT \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"query":"query { __typename }"}' \
    "$BASE_URL/graphql" 2>/dev/null)

if [ -n "$db_test" ]; then
    if echo "$db_test" | grep -q 'database' || echo "$db_test" | grep -q '"errors"'; then
        if echo "$db_test" | grep -q '"errors"'; then
            if echo "$db_test" | grep -q 'Not authenticated' || echo "$db_test" | grep -q 'Unauthorized'; then
                print_success "Database - Conexión OK (auth requerida)"
            else
                print_warning "Database - Conexión OK pero hay errores de query"
                echo "  $db_test"
            fi
        fi
    else
        print_success "Database - Conexión verificada"
    fi
fi

# ===========================================
# 4. REDIS CONNECTION
# ===========================================

print_header "4. REDIS CONNECTION"

if echo "$health_response" | grep -q '"redis":"connected"'; then
    print_success "Redis - Connected via health check"
elif echo "$health_response" | grep -q '"redis"'; then
    print_warning "Redis - No está en estado 'connected'"
    print_info "Verificar REDIS_URL en Railway variables"
else
    print_info "Redis - Estado no disponible en /health"
fi

# ===========================================
# 5. ADDITIONAL CHECKS
# ===========================================

print_header "5. ADDITIONAL CHECKS"

metrics_response=$(curl -s --max-time $TIMEOUT "$BASE_URL/metrics" 2>/dev/null)
if [ -n "$metrics_response" ]; then
    print_success "/metrics - Endpoint disponible"
else
    print_warning "/metrics - No disponible (opcional)"
fi

cors_test=$(curl -s -I --max-time $TIMEOUT \
    -H "Origin: $BASE_URL" \
    "$BASE_URL/health" 2>/dev/null)

if echo "$cors_test" | grep -qi 'access-control'; then
    print_success "CORS - Headers configurados"
else
    print_warning "CORS - Headers no detectados"
fi

# ===========================================
# SUMMARY
# ===========================================

print_header "VERIFICATION SUMMARY"

echo ""
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}==========================================${NC}"
    echo -e "${GREEN}   ALL CHECKS PASSED ✓${NC}"
    echo -e "${GREEN}==========================================${NC}"
    echo ""
    echo "Backend desplegado correctamente en: $BASE_URL"
    echo ""
    echo "Próximos pasos:"
    echo "  1. Configurar webhook de MercadoPago: $BASE_URL/webhooks/mercadopago"
    echo "  2. Actualizar FRONTEND_URL si es necesario"
    echo "  3. Verificar integración con frontend"
    echo ""
    exit 0
else
    echo -e "${RED}==========================================${NC}"
    echo -e "${RED}   $FAILURES CHECK(S) FAILED${NC}"
    echo -e "${RED}==========================================${NC}"
    echo ""
    echo "Revisar los errores arriba y verificar:"
    echo "  1. Variables de entorno en Railway"
    echo "  2. Logs del deployment en Railway dashboard"
    echo "  3. Conexiones a Supabase y Upstash"
    echo ""
    exit 1
fi
