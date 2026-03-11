/*
 * Filename: C01021.c
 * Description: Calculates sums
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
    int sum = 0;
    while (n > 0)
    {
        sum += n % 10;
        n /= 10;
    }
    printf("%d", sum); // Print result
    return 0;
}