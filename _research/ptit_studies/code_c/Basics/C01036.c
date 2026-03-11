/*
 * Filename: C01036.c
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
    int res = 1;
    while (n > 0)
    {
        res *= n % 10;
        n /= 10;
    }
    printf("%d", res); // Print result
    return 0;
}