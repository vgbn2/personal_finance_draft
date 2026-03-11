/*
 * Filename: C01038.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a = n, dem = 0;
    int dau, cuoi = n % 10;
    while (a > 0)
    {
        if (a < 10)
            dau = a;
        dem++;
        a /= 10;
    }
    n = n - cuoi - dau * pow(10, dem - 1) + dau + cuoi * pow(10, dem - 1);
    printf("%lld", n); // Print result
    return 0;
}