/* spiral primne matrix:
input: n
output: n*n matrix with spiral prime numbers
check prime function
generate n*n prime numbers
spiral generation function

*/
#include <stdio.h>
#include <stdbool.h>
#include <math.h>
bool ktnt(int n){
    if( n<2)return 0;
    for(int i=2;i<=sqrt(n);i++){
        if(n%i==0)return 0;
    }
    return 1;
}
void generatePrimes(int count, int primes[]) {
    int num = 2, idx = 0;
    while (idx < count) {
        if (ktnt(num)) {
            primes[idx++] = num;
        }
        num++;
    }
}
// Counter-clockwise: Down (Left Col) -> Right (Bottom Row) -> Up (Right Col) -> Left (Top Row)
void spiral(int n, int primes[], int a[100][100]){
    int dong = n - 1, tay = 0, nam = n - 1, bac = 0, dem = 0;
    while(bac <= nam && tay <= dong){
        // Left Column (Top to Bottom)
        for(int i = bac; i <= nam; i++){
            a[i][tay] = primes[dem++];
        }
        tay++;

        // Bottom Row (Left to Right)
        for(int i = tay; i <= dong; i++){
            a[nam][i] = primes[dem++];
        }
        nam--;

        // Right Column (Bottom to Top)
        if (tay <= dong) {
            for(int i = nam; i >= bac; i--){
                a[i][dong] = primes[dem++];
            }
            dong--;
        }

        // Top Row (Right to Left)
        if (bac <= nam) {
            for(int i = dong; i >= tay; i--){
                a[bac][i] = primes[dem++];
            }
            bac++;
        }
    }
}
void spiral2(int n, int primes[], int a[100][100])//clockwise
{
    int dong = n - 1, tay = 0, nam = n - 1, bac = 0, dem = 0;
    while(bac <= nam && tay <= dong){
        // Top Row (left to right)
        for(int i = tay; i <= dong; i++){
            a[bac][i] = primes[dem++];
        }
        bac++;

        // Right Column (top to bottom)
        if (tay <= dong) { // Check if there's still a column to fill
            for(int i = bac; i <= nam; i++){
                a[i][dong] = primes[dem++];
            }
            dong--;
        }

        // Bottom Row (right to left)
        if (bac <= nam) { // Check if there's still a row to fill
            for(int i = dong; i >= tay; i--){
                a[nam][i] = primes[dem++];
            }
            nam--;
        }

        // Left Column (bottom to top)
        if (tay <= dong) { // Check if there's still a column to fill
            for(int i = nam; i >= bac; i--){
                a[i][tay] = primes[dem++];
            }
            tay++;
        }
    }
}
int main(){
    int n;
    scanf("%d", &n);
    int a[100][100];
    int primes[100 * 100]; // Max size n=100
    generatePrimes(n * n, primes);
    spiral(n, primes, a); // Call the counter-clockwise spiral function
    for(int i = 0; i < n; i++){
        for(int j = 0; j < n; j++){
            printf("%d ", a[i][j]);
        }
        printf("\n");
    }
    return 0;
}