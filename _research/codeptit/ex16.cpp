#include <stdio.h>
int tongchuso(int n) {
    int sum = 0;
    while (n > 0) {
        sum += (n % 10);  
        n /= 10;          
    }
    return sum;
}
int main() {
    int t, n;
    scanf("%d", &t); 
    while (t--) {
        scanf("%d", &n);
        printf("%d\n", tongchuso(n));
    }
    
    return 0;
}
