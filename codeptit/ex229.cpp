#include <stdio.h>
#include <stdbool.h>
#include <math.h>

bool prime(int num) {
  if (num == 2) return true;
    if (num<=1) return false;
    if (num%2 == 0) return false;
    for (int j = 3; j<= sqrt(num); j += 2) {
        if (num % j == 0) return false;
    }
    return true;
}

int tongchuso(int n) {
    int sum = 0;
    while (n > 0) {
        sum += n % 10;
        n /= 10;
    }
    return sum;
}

int demnguyento(int n) {
    int count = 0;
    while (n > 0) {
        int digit = n % 10;
        if (prime(digit)) {
            count++;
        }
        n /= 10;
    }
    return count;
}

int digi(int o) {
    return (int)log10(o) + 1; 
}

void check(int a, int b) {
    int count = 0;
    for (int i = a; i <= b; i++) {  
        if (prime(i) && digi(i) == demnguyento(i) && prime(tongchuso(i))) {
            count++;
        }
    }
    printf("%d\n", count);
}

int main() {
    int n, a, b;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        scanf("%d %d", &a, &b);
        check(a, b);
    }
    return 0;
}
